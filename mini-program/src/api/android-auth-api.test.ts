import { describe, expect, it, vi } from "vitest";
import { createAndroidAuthApi } from "./android-auth-api";

const nativeRequest = vi.hoisted(() => vi.fn());
const networkAdd = vi.hoisted(() => vi.fn((_item: Record<string, unknown>) => ({ id: "vc-auth-1" })));
const networkUpdate = vi.hoisted(() => vi.fn((_id: string, _item: Record<string, unknown>) => undefined));
vi.mock("@capacitor/core", () => ({
  Capacitor: { isNativePlatform: () => true },
  CapacitorHttp: { request: nativeRequest },
}));

describe("Android auth API", () => {
  it("loads a real captcha through the native transport and preserves HTTP errors", async () => {
    const captcha = { captchaId: "c1", image: "<svg></svg>", expiresIn: 120 };
    nativeRequest.mockResolvedValueOnce({ status: 200, data: captcha });
    const api = createAndroidAuthApi();
    await expect(api.getCaptcha()).resolves.toEqual(captcha);
    expect(nativeRequest).toHaveBeenCalledWith(expect.objectContaining({
      url: expect.stringContaining("/auth/captcha"), method: "POST", responseType: "json",
    }));
    nativeRequest.mockResolvedValueOnce({ status: 429, data: { code: "AUTH_RATE_LIMITED" } });
    await expect(api.getCaptcha()).rejects.toMatchObject({ code: "AUTH_RATE_LIMITED", status: 429 });
    nativeRequest.mockRejectedValueOnce(new Error("offline"));
    await expect(api.getCaptcha()).rejects.toMatchObject({ code: "AUTH_NETWORK_ERROR" });
  });

  it("records native requests in the vConsole Network panel without exposing credentials", async () => {
    networkAdd.mockClear();
    networkUpdate.mockClear();
    const originalWindow = globalThis.window;
    globalThis.window = {
      __VCONSOLE_INSTANCE: { network: { add: networkAdd, update: networkUpdate } },
    } as unknown as Window & typeof globalThis;
    nativeRequest.mockResolvedValueOnce({ status: 200, data: { captchaId: "c1" } });

    try {
      await createAndroidAuthApi().getCaptcha();
    } finally {
      globalThis.window = originalWindow;
    }

    expect(networkAdd).toHaveBeenCalledWith(expect.objectContaining({
      method: "POST",
      requestType: "custom",
      status: "Pending",
      url: expect.stringContaining("/auth/captcha"),
    }));
    expect(networkUpdate).toHaveBeenCalledWith("vc-auth-1", expect.objectContaining({
      status: 200,
      response: { captchaId: "c1" },
    }));
    const networkItem = networkAdd.mock.calls[0][0];
    expect(networkItem).not.toHaveProperty("postData");
    expect(networkItem).not.toHaveProperty("requestHeader.authorization");
  });

  it("records the full response body for subsequent native auth requests", async () => {
    networkAdd.mockClear();
    networkUpdate.mockClear();
    const originalWindow = globalThis.window;
    globalThis.window = {
      __VCONSOLE_INSTANCE: { network: { add: networkAdd, update: networkUpdate } },
    } as unknown as Window & typeof globalThis;
    const response = { user: { id: "u1" }, session: { accessToken: "token" }, onboardingRequired: false };
    nativeRequest.mockResolvedValueOnce({ status: 200, data: response });

    try {
      await createAndroidAuthApi().loginGoogle("google-id-token");
    } finally {
      globalThis.window = originalWindow;
    }

    expect(networkUpdate).toHaveBeenCalledWith("vc-auth-1", expect.objectContaining({
      status: 200,
      response,
    }));
  });

  it("uses password login without an OTP request", async () => {
    const request = vi
      .fn()
      .mockResolvedValue({ user: { id: "u1" }, session: { accessToken: "token" } });
    const api = createAndroidAuthApi({ request });

    await api.loginEmail({
      email: "user@example.com",
      password: "password",
    });

    expect(request).toHaveBeenCalledWith("/auth/login/email", {
      email: "user@example.com",
      password: "password",
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("keeps Email OTP requests on registration and forgot-password methods", async () => {
    const request = vi.fn().mockResolvedValue({ sent: true, expiresIn: 600, resendAfter: 60 });
    const api = createAndroidAuthApi({ request });

    await api.sendEmailCode({ email: "user@example.com", captchaId: "c1", captchaAnswer: "abcd" });
    await api.forgotEmail({ email: "user@example.com", captchaId: "c2", captchaAnswer: "efgh" });

    expect(request).toHaveBeenNthCalledWith(1, "/auth/register/email/send-code", {
      email: "user@example.com",
      captchaId: "c1",
      captchaAnswer: "abcd",
    });
    expect(request).toHaveBeenNthCalledWith(2, "/auth/password/forgot/email", {
      email: "user@example.com",
      captchaId: "c2",
      captchaAnswer: "efgh",
    });
  });

  it("routes phone password auth and Google credential auth to the Android endpoints", async () => {
    const request = vi.fn().mockResolvedValue({ user: { id: "u1" }, session: { accessToken: "token" } });
    const api = createAndroidAuthApi({ request });

    await api.sendPhoneCode({ phone: "+8613800138000", captchaId: "c1", captchaAnswer: "abcd" });
    await api.loginPhone({ phone: "+8613800138000", password: "password" });
    await api.loginGoogle("google-id-token");

    expect(request).toHaveBeenNthCalledWith(1, "/auth/register/phone/send-code", {
      phone: "+8613800138000",
      captchaId: "c1",
      captchaAnswer: "abcd",
    });
    expect(request).toHaveBeenNthCalledWith(2, "/auth/login/phone", {
      phone: "+8613800138000",
      password: "password",
    });
    expect(request).toHaveBeenNthCalledWith(3, "/auth/login/google", { idToken: "google-id-token" });
  });
});
