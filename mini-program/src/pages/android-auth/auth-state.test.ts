import { describe, expect, it } from "vitest";
import { getAuthBackState, getAuthInputError, type AuthView } from "./auth-state";

describe("Android auth navigation", () => {
  it("rejects malformed targets before a verification request", () => {
    for (const email of ["", "name.example.com", "name@example", "name＠example.com", "name @example.com"]) {
      expect(getAuthInputError("email", email, "captcha", "abcd")).toContain("邮箱地址");
    }
    expect(getAuthInputError("email", " name@example.com ", "captcha", "abcd")).toBe("");
    expect(getAuthInputError("phone", "+", "captcha", "abcd")).toContain("手机号");
    expect(getAuthInputError("email", "name@example.com")).toContain("加载");
    expect(getAuthInputError("email", "name@example.com", "captcha", " ")).toBe("请输入图形验证码");
    expect(getAuthInputError("email", "name@example.com", undefined, "", false)).toBe("");
    expect(getAuthInputError("phone", "+8613800138000", undefined, "", false)).toBe("");
  });
  it("closes the country picker before leaving the auth flow", () => {
    expect(getAuthBackState("phone-register", true)).toEqual({ view: "phone-register", closePicker: true });
  });

  it("returns each auth step to its logical previous view", () => {
    const cases: Array<[AuthView, AuthView]> = [
      ["email-login", "landing"],
      ["phone-login", "landing"],
      ["email-register", "email-login"],
      ["email-register-otp", "email-register"],
      ["email-register-password", "email-register-otp"],
      ["phone-register", "phone-login"],
      ["phone-register-otp", "phone-register"],
      ["phone-register-password", "phone-register-otp"],
      ["forgot-email", "email-login"],
      ["forgot-phone", "phone-login"],
      ["reset-password", "forgot-email"],
    ];

    for (const [view, expected] of cases) {
      expect(getAuthBackState(view, false)).toEqual({ view: expected, closePicker: false });
    }

    expect(getAuthBackState("reset-password", false, "phone")).toEqual({ view: "forgot-phone", closePicker: false });
  });
});
