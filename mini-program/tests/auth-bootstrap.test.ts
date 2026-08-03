import { describe, expect, it, vi } from "vitest";
import { createAuthBootstrap } from "../src/auth/auth-bootstrap";

const session = { accessToken: "access", refreshToken: "refresh" };
const user = { id: "user-1" };

describe("auth bootstrap", () => {
  it("restores a verified session without calling wx.login", async () => {
    const login = vi.fn();
    const bootstrap = createAuthBootstrap({
      restore: vi.fn().mockResolvedValue(session),
      getUser: vi.fn().mockResolvedValue(user),
      refresh: vi.fn(),
      login,
      loadIdentity: vi.fn(),
      clear: vi.fn(),
    });

    await bootstrap.start();

    expect(login).not.toHaveBeenCalled();
    expect(bootstrap.getState().status).toBe("authenticated");
  });

  it("refreshes once then clears an invalid restored session", async () => {
    const refresh = vi.fn().mockResolvedValue(null);
    const clear = vi.fn();
    const bootstrap = createAuthBootstrap({
      restore: vi.fn().mockResolvedValue(session),
      getUser: vi.fn().mockRejectedValue({ status: 401 }),
      refresh,
      login: vi.fn(),
      loadIdentity: vi.fn(),
      clear,
    });

    await bootstrap.start({ allowSilentLogin: false });

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(bootstrap.getState().status).toBe("unauthenticated");
  });

  it("shares one in-flight initial wx.login operation", async () => {
    const login = vi.fn().mockResolvedValue(user);
    const bootstrap = createAuthBootstrap({
      restore: vi.fn().mockResolvedValue(null),
      getUser: vi.fn(),
      refresh: vi.fn(),
      login,
      loadIdentity: vi.fn(),
      clear: vi.fn(),
    });

    await Promise.all([bootstrap.start(), bootstrap.start()]);

    expect(login).toHaveBeenCalledTimes(1);
    expect(bootstrap.getState().status).toBe("authenticated");
  });

  it("force restart re-runs bootstrap after a pre-login flight", async () => {
    let resolveFirstRestore: ((value: null) => void) | undefined;
    const restore = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<null>((resolve) => {
            resolveFirstRestore = resolve;
          }),
      )
      .mockResolvedValueOnce(session);
    const getUser = vi.fn().mockResolvedValue(user);
    const bootstrap = createAuthBootstrap({
      restore,
      getUser,
      refresh: vi.fn(),
      login: vi.fn(),
      loadIdentity: vi.fn(),
      clear: vi.fn(),
    });

    const first = bootstrap.start({ allowSilentLogin: false });
    const second = bootstrap.start({ allowSilentLogin: false, force: true });
    resolveFirstRestore?.(null);
    await Promise.all([first, second]);

    expect(restore).toHaveBeenCalledTimes(2);
    expect(bootstrap.getState().status).toBe("authenticated");
  });

  it("treats a cleared session during identity load as unauthenticated", async () => {
    const clear = vi.fn();
    const getUser = vi
      .fn()
      .mockResolvedValueOnce(user)
      .mockResolvedValueOnce(null);
    const bootstrap = createAuthBootstrap({
      restore: vi.fn().mockResolvedValue(session),
      getUser,
      refresh: vi.fn(),
      login: vi.fn(),
      loadIdentity: vi.fn().mockRejectedValue(new Error("SESSION_USER_MISSING")),
      clear,
    });

    await bootstrap.start();

    expect(bootstrap.getState().status).toBe("unauthenticated");
    expect(clear).not.toHaveBeenCalled();
  });

  it("stays at the manual login entry when silent login is disabled", async () => {
    const login = vi.fn();
    const bootstrap = createAuthBootstrap({
      restore: vi.fn().mockResolvedValue(null),
      getUser: vi.fn(),
      refresh: vi.fn(),
      login,
      loadIdentity: vi.fn(),
      clear: vi.fn(),
    });

    await bootstrap.start({ allowSilentLogin: false });

    expect(login).not.toHaveBeenCalled();
    expect(bootstrap.getState().status).toBe("unauthenticated");
  });

  it("keeps a valid authenticated session when optional identity hydration fails", async () => {
    const clear = vi.fn();
    const bootstrap = createAuthBootstrap({
      restore: vi.fn().mockResolvedValue(session),
      getUser: vi.fn().mockResolvedValue(user),
      refresh: vi.fn(),
      login: vi.fn(),
      loadIdentity: vi.fn().mockRejectedValue(new Error("profile network failure")),
      clear,
    });

    await bootstrap.start();

    expect(bootstrap.getState().status).toBe("authenticated");
    expect(clear).not.toHaveBeenCalled();
  });
});
