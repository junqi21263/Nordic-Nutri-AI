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
});
