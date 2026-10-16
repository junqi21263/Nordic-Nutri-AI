import { describe, expect, it, vi } from "vitest";
import { createAndroidAuthApi, toAppSession } from "../src/api/android-auth-api";

describe("Android auth API refresh sessions", () => {
  it("exposes refresh and logout without leaking tokens into URL parameters", async () => {
    const request = vi.fn().mockResolvedValue({ ok: true });
    const api = createAndroidAuthApi({ request });

    await api.refresh("refresh-1");
    await api.logout("refresh-2");

    expect(request).toHaveBeenNthCalledWith(1, "/auth/refresh", { refreshToken: "refresh-1" });
    expect(request).toHaveBeenNthCalledWith(2, "/auth/logout", { refreshToken: "refresh-2" });
  });

  it("maps both access and refresh credentials into the app session", () => {
    expect(toAppSession({
      user: { id: "user-1" },
      session: {
        accessToken: "access-1",
        expiresIn: 604800,
        refreshToken: "refresh-1",
        refreshExpiresIn: 2592000,
      },
    })).toEqual({
      user: { id: "user-1" },
      accessToken: "access-1",
      refreshToken: "refresh-1",
    });
  });

  it("exposes authenticated contact and Google binding endpoints", async () => {
    const request = vi.fn().mockResolvedValue({ user: { id: "current" } });
    const api = createAndroidAuthApi({ request });
    await api.sendBindingCode("email", { email: "new@example.com", captchaId: "c1", captchaAnswer: "ok" });
    await api.bindContact("phone", { phone: "+8613800138000", code: "123456" });
    await api.bindGoogle("google-token");
    expect(request).toHaveBeenNthCalledWith(1, "/auth/bind/email/send-code", { email: "new@example.com", captchaId: "c1", captchaAnswer: "ok" });
    expect(request).toHaveBeenNthCalledWith(2, "/auth/bind/phone", { phone: "+8613800138000", code: "123456" });
    expect(request).toHaveBeenNthCalledWith(3, "/auth/bind/google", { idToken: "google-token" });
  });
});
