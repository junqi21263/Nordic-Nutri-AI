import { beforeEach, describe, expect, it, vi } from "vitest";

const persisted = new Map<string, string>();
const refresh = vi.fn();

vi.mock("../src/platform/secure-token-storage", () => ({
  createSecureTokenStorage: () => ({
    getItem: (key: string) => persisted.get(key) ?? null,
    setItem: (key: string, value: string) => persisted.set(key, value),
    removeItem: (key: string) => persisted.delete(key),
  }),
}));

vi.mock("../src/api/android-auth-api", () => ({
  androidAuthApi: { refresh, logout: vi.fn() },
  toAppSession: (result: { user: { id: string }; session: { accessToken: string; refreshToken: string } }) => ({
    user: result.user,
    accessToken: result.session.accessToken,
    refreshToken: result.session.refreshToken,
  }),
}));

describe("Android session manager", () => {
  beforeEach(async () => {
    persisted.clear();
    refresh.mockReset();
    const { clearInvalidSession } = await import("../src/auth/session-manager");
    await clearInvalidSession();
  });

  it("restores a legacy access-only session", async () => {
    persisted.set("nordic-nutri:session:v1", JSON.stringify({
      user: { id: "legacy-user" },
      accessToken: "legacy-access",
    }));
    const { restoreSession } = await import("../src/auth/session-manager");

    await expect(restoreSession()).resolves.toEqual({
      user: { id: "legacy-user" },
      accessToken: "legacy-access",
    });
  });

  it("shares one refresh request and persists the rotated token", async () => {
    const { setNativeSession, refreshSession, restoreSession } = await import("../src/auth/session-manager");
    setNativeSession({
      user: { id: "user-1" },
      accessToken: "expired-access",
      refreshToken: "refresh-old",
    });
    refresh.mockResolvedValue({
      user: { id: "user-1" },
      session: { accessToken: "access-new", refreshToken: "refresh-new" },
    });

    const [first, second] = await Promise.all([refreshSession(), refreshSession()]);

    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith("refresh-old");
    expect(first).toEqual(second);
    expect(first?.refreshToken).toBe("refresh-new");
    await expect(restoreSession()).resolves.toEqual(first);
    expect(JSON.parse(persisted.get("nordic-nutri:session:v1") ?? "{}").refreshToken).toBe("refresh-new");
  });

  it("cannot refresh a legacy session without a refresh credential", async () => {
    const { setNativeSession, refreshSession } = await import("../src/auth/session-manager");
    setNativeSession({ user: { id: "legacy-user" }, accessToken: "legacy-access" });

    await expect(refreshSession()).resolves.toBeNull();
    expect(refresh).not.toHaveBeenCalled();
  });
});
