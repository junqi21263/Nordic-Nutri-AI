export type AuthBootstrapStatus = "initializing" | "authenticated" | "unauthenticated";

export interface AuthBootstrapState {
  status: AuthBootstrapStatus;
}

export interface AuthBootstrapDependencies<Session = unknown, User = unknown> {
  restore: () => Promise<Session | null>;
  getUser: () => Promise<User | null>;
  refresh: () => Promise<Session | null>;
  login: () => Promise<User | null>;
  loadIdentity: (user: User) => Promise<void>;
  clear: () => void | Promise<void>;
}

function isUnauthorized(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: number; statusCode?: number; code?: string };
  return candidate.status === 401 || candidate.statusCode === 401 || candidate.code === "UNAUTHORIZED";
}

export function createAuthBootstrap<Session = unknown, User = unknown>(
  dependencies: AuthBootstrapDependencies<Session, User>,
) {
  let state: AuthBootstrapState = { status: "initializing" };
  let inFlight: Promise<void> | null = null;

  const setStatus = (status: AuthBootstrapStatus) => {
    state = { status };
  };

  const clear = async () => {
    await dependencies.clear();
    setStatus("unauthenticated");
  };

  const authenticate = async (user: User | null) => {
    if (!user) {
      await clear();
      return;
    }
    await dependencies.loadIdentity(user);
    setStatus("authenticated");
  };

  const run = async (allowSilentLogin: boolean) => {
    setStatus("initializing");
    try {
      const session = await dependencies.restore();
      if (!session) {
        if (!allowSilentLogin) {
          setStatus("unauthenticated");
          return;
        }
        await authenticate(await dependencies.login());
        return;
      }

      try {
        await authenticate(await dependencies.getUser());
      } catch (error) {
        if (!isUnauthorized(error) || !(await dependencies.refresh())) {
          await clear();
          return;
        }
        await authenticate(await dependencies.getUser());
      }
    } catch {
      await clear();
    }
  };

  const start = ({ allowSilentLogin = true }: { allowSilentLogin?: boolean } = {}) => {
    if (!inFlight) inFlight = run(allowSilentLogin).finally(() => { inFlight = null; });
    return inFlight;
  };

  return {
    start,
    loginFromEntry: () => start({ allowSilentLogin: true }),
    getState: () => state,
  };
}
