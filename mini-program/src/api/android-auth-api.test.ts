import { describe, expect, it, vi } from "vitest";
import { createAndroidAuthApi } from "./android-auth-api";

describe("Android auth API", () => {
  it("uses password login without an OTP request", async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ user: { id: "u1" }, session: { accessToken: "token" } });
    const api = createAndroidAuthApi({ request });

    await api.loginEmail({
      email: "user@example.com",
      password: "password",
      captchaId: "c1",
      captchaAnswer: "abcd",
    });

    expect(request).toHaveBeenCalledWith("/auth/login/email", {
      email: "user@example.com",
      password: "password",
      captchaId: "c1",
      captchaAnswer: "abcd",
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("keeps OTP requests on registration and forgot-password methods", async () => {
    const request = vi.fn().mockResolvedValue({ sent: true, expiresIn: 600, resendAfter: 60 });
    const api = createAndroidAuthApi({ request });

    await api.sendEmailCode({ email: "user@example.com", captchaId: "c1", captchaAnswer: "abcd" });
    await api.sendPhoneCode({ phone: "+8613800138000", captchaId: "c2", captchaAnswer: "efgh" });

    expect(request).toHaveBeenNthCalledWith(1, "/auth/register/email/send-code", {
      email: "user@example.com",
      captchaId: "c1",
      captchaAnswer: "abcd",
    });
    expect(request).toHaveBeenNthCalledWith(2, "/auth/register/phone/send-code", {
      phone: "+8613800138000",
      captchaId: "c2",
      captchaAnswer: "efgh",
    });
  });
});
