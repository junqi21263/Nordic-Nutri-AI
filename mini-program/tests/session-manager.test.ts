import { beforeEach, describe, expect, it, vi } from "vitest";

const persisted = new Map<string, string>();
const refresh = vi.fn();
const logout = vi.fn();
const unregisterPushToken = vi.hoisted(() => vi.fn());
const cancelReminders = vi.hoisted(() => vi.fn());

vi.mock("../src/platform/secure-token-storage", () => ({
  createSecureTokenStorage: () => ({
    getItem: (key: string) => persisted.get(key) ?? null,
    setItem: (key: string, value: string) => persisted.set(key, value),
    removeItem: (key: string) => persisted.delete(key),
  }),
}));

vi.mock("../src/api/android-auth-api", () => ({
  androidAuthApi: { refresh, logout },
  toAppSession: (result: { user: { id: string }; session: { accessToken: string; refreshToken: string } }) => ({
    user: result.user,
    accessToken: result.session.accessToken,
    refreshToken: result.session.refreshToken,
  }),
}));

vi.mock("../src/features/smart-reminders/push-coordinator", () => ({
  unregisterAndroidPushToken: unregisterPushToken,
}));

vi.mock("../src/features/smart-reminders/coordinator", () => ({
  cancelAndroidSmartReminders: cancelReminders,
}));

describe("Android session manager", () => {
  beforeEach(async () => {
    persisted.clear();
    refresh.mockReset();
    logout.mockReset();
    unregisterPushToken.mockReset().mockResolvedValue(true);
    cancelReminders.mockReset().mockResolvedValue(true);
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

  it("revokes the current device refresh token before clearing local state", async () => {
    const { setNativeSession, signOut, restoreSession } = await import("../src/auth/session-manager");
    setNativeSession({ user: { id: "user-1" }, accessToken: "access", refreshToken: "refresh-current" });
    unregisterPushToken.mockClear();
    logout.mockResolvedValue({ ok: true });

    await signOut();

    expect(logout).toHaveBeenCalledWith("refresh-current");
    expect(unregisterPushToken).toHaveBeenCalledTimes(1);
    expect(unregisterPushToken.mock.invocationCallOrder[0]).toBeLessThan(logout.mock.invocationCallOrder[0]);
    await expect(restoreSession()).resolves.toBeNull();
  });

  it("clears invalid local credentials without retrying authenticated push cleanup", async () => {
    const { setNativeSession, clearInvalidSession } = await import("../src/auth/session-manager");
    const { useAuthStore } = await import("../src/auth/auth-store");
    setNativeSession({ user: { id: "user-1" }, accessToken: "invalid-access", refreshToken: "invalid-refresh" });
    unregisterPushToken.mockClear();

    await clearInvalidSession();

    expect(useAuthStore.getState().session).toBeNull();
    expect(persisted.has("nordic-nutri:session:v1")).toBe(false);
    expect(unregisterPushToken).not.toHaveBeenCalled();
  });

  it("logs out the rotated refresh token when push cleanup refreshes the session", async () => {
    const { setNativeSession, signOut } = await import("../src/auth/session-manager");
    setNativeSession({ user: { id: "user-1" }, accessToken: "access", refreshToken: "refresh-old" });
    unregisterPushToken.mockImplementationOnce(async () => {
      setNativeSession({ user: { id: "user-1" }, accessToken: "access-new", refreshToken: "refresh-new" });
      return true;
    });

    await signOut();

    expect(logout).toHaveBeenCalledWith("refresh-new");
  });

  it("still clears local state when remote logout is unavailable", async () => {
    const { setNativeSession, signOut, restoreSession } = await import("../src/auth/session-manager");
    setNativeSession({ user: { id: "user-1" }, accessToken: "access", refreshToken: "refresh-current" });
    logout.mockRejectedValue(new Error("offline"));

    await expect(signOut()).resolves.toBeUndefined();
    await expect(restoreSession()).resolves.toBeNull();
  });
});
