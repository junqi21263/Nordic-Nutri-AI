export type AuthBootstrapStatus = "initializing" | "authenticated" | "unauthenticated";

export interface AuthBootstrapState {
  status: AuthBootstrapStatus;
}

export interface AuthBootstrapDependencies<Session = unknown, User = unknown> {
  preserveSessionOnError?: boolean;
  restore: () => Promise<Session | null>;
  getUser: () => Promise<User | null>;
  refresh: () => Promise<Session | null>;
  login: () => Promise<User | null>;
  loadIdentity: (user: User) => Promise<void>;
  clear: () => void | Promise<void>;
}

export interface AuthBootstrapStartOptions {
  allowSilentLogin?: boolean;
  /** Abandon an in-flight bootstrap (e.g. after WeChat login) and re-run. */
  force?: boolean;
}

function isUnauthorized(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: number; statusCode?: number; code?: string };
  return (
    candidate.status === 401 || candidate.statusCode === 401 || candidate.code === "UNAUTHORIZED"
  );
}

export function createAuthBootstrap<Session = unknown, User = unknown>(
  dependencies: AuthBootstrapDependencies<Session, User>,
) {
  let state: AuthBootstrapState = { status: "initializing" };
  let inFlight: Promise<void> | null = null;
  let runId = 0;

  const setStatus = (status: AuthBootstrapStatus) => {
    state = { status };
  };

  const clear = async () => {
    await dependencies.clear();
    setStatus("unauthenticated");
  };

  const authenticate = async (
    user: User | null,
    id: number,
    { retryLogin = false }: { retryLogin?: boolean } = {},
  ) => {
    if (!user) {
      await clear();
      return;
    }
    try {
      await dependencies.loadIdentity(user);
    } catch {
      // Identity load may clear the session (deleted user). Do not stay authenticated.
      if (!(await dependencies.getUser())) {
        if (id !== runId) return;
        if (retryLogin) {
          await authenticate(await dependencies.login(), id);
          return;
        }
        await clear();
        return;
      }
      // A profile/settings read failure must not invalidate an already verified Auth session.
    }
    if (id !== runId) return;
    setStatus("authenticated");
  };

  const run = async (allowSilentLogin: boolean, id: number) => {
    if (id === runId) setStatus("initializing");
    try {
      const session = await dependencies.restore();
      if (id !== runId) return;
      if (!session) {
        if (!allowSilentLogin) {
          setStatus("unauthenticated");
          return;
        }
        await authenticate(await dependencies.login(), id);
        return;
      }

      try {
        await authenticate(await dependencies.getUser(), id, {
          retryLogin: allowSilentLogin,
        });
      } catch (error) {
        if (id !== runId) return;
        if (dependencies.preserveSessionOnError && !isUnauthorized(error)) throw error;
        if (!isUnauthorized(error) || !(await dependencies.refresh())) {
          await clear();
          return;
        }
        if (id !== runId) return;
        await authenticate(await dependencies.getUser(), id, {
          retryLogin: allowSilentLogin,
        });
      }
    } catch (error) {
      if (id !== runId) return;
      if (dependencies.preserveSessionOnError && !isUnauthorized(error)) throw error;
      await clear();
    }
  };

  const start = ({ allowSilentLogin = true, force = false }: AuthBootstrapStartOptions = {}) => {
    if (!inFlight || force) {
      const id = ++runId;
      const promise = run(allowSilentLogin, id).finally(() => {
        if (inFlight === promise) inFlight = null;
      });
      inFlight = promise;
    }
    return inFlight as Promise<void>;
  };

  return {
    start,
    loginFromEntry: () => start({ allowSilentLogin: true }),
    getState: () => state,
  };
}
