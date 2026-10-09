import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { expectLocalizedCopy } from "./i18n-source-assertions";

const root = resolve(import.meta.dirname, "../src");

describe("Android auth flow UI contract", () => {
  it("keeps the reference-inspired landing hierarchy and stable provider layout", () => {
    const page = readFileSync(resolve(root, "pages/android-auth/index.tsx"), "utf8");
    const styles = readFileSync(resolve(root, "pages/android-auth/index.scss"), "utf8");
    const loginBlock = page.slice(page.indexOf("const renderLogin"), page.indexOf("const renderRegisterStart"));
    const registerBlock = page.slice(page.indexOf("const renderRegisterStart"), page.indexOf("const renderOtp"));

    expect(page).toContain("auth-landing__intro");
    expect(page).toContain("auth-form-shell auth-form-shell--login");
    expect(page).toContain("auth-form-shell auth-form-shell--register");
    expect(page).toContain("auth-form-shell auth-form-shell--otp");
    expect(page).toContain("auth-form-shell auth-form-shell--register-password");
    expect(page).toContain("auth-form-shell auth-form-shell--forgot");
    expect(page).toContain("auth-form-shell auth-form-shell--reset");
    expect(page).not.toContain("auth-landing__eyebrow-row");
    expect(page).toContain("auth-create-account__link");
    expectLocalizedCopy(page, "立即注册帐号");
    expect(page).not.toContain("auth-create-account .app-button");
    expectLocalizedCopy(page, "Google 登录服务暂不可用，请稍后重试");
    expect(page).toContain('code === "AUTH_RATE_LIMITED"');
    expect(page).toContain('t(dailyLimit ? "androidAuth.limit.dailyTitle" : "androidAuth.limit.frequentTitle")');
    expect(page).toContain('t(dailyLimit ? "androidAuth.limit.dailyTitle" : "androidAuth.limit.frequentTitle")');
    expect(page).toContain('code === "AUTH_EMAIL_ALREADY_REGISTERED" || code === "AUTH_PHONE_ALREADY_REGISTERED"');
    expectLocalizedCopy(page, "去登录");
    expect(page).toContain('showFeedbackModal({');
    expect(page).not.toContain("if (isLogin) await refreshCaptcha()");
    expect(styles).toMatch(/\.auth-create-account \{[\s\S]*?align-items: center;[\s\S]*?justify-content: center;/);
    expect(styles).toContain(".auth-create-account__link { color: $color-forest-green; text-decoration: underline; }");
    expect(loginBlock).not.toContain("renderCaptcha()");
    expect(loginBlock).not.toContain('onClick={() => switchMethod(isPhone ? "email" : "phone")}');
    expectLocalizedCopy(registerBlock, "已有账号？");
    expectLocalizedCopy(registerBlock, "去登录");
    expect(page).toContain("verifyRegisterCode");
    expect(page).not.toContain("返回修改验证码");
    expect(page).toContain('onClick={() => navigate("landing")}');
    expectLocalizedCopy(page, "返回首页");
    expect(styles).toContain(".auth-landing__content { position: relative; margin-top: -24PX;");
    expect(styles).toContain(".auth-landing__intro { display: flex; flex-direction: column;");
    expect(styles).toContain(".auth-form-shell { display: flex; flex-direction: column; min-height:");
    expect(styles).toContain(".auth-captcha__refresh { position: absolute; right: 5PX; bottom: 5PX;");
    expect(styles).toMatch(/\.auth-phone-input__control \{[\s\S]*?display: flex;[\s\S]*?align-items: center;/);
    expect(styles).toContain("page-layout--android-auth.page-layout--auth-view-landing");
    expect(styles).toContain(".auth-button-content--busy::before { position: absolute;");
  });

  it("centers each OTP digit in the Taro input host and its native input", () => {
    const styles = readFileSync(resolve(root, "pages/android-auth/index.scss"), "utf8");
    expect(styles).toContain(".auth-otp__cell { display: flex; align-items: center; justify-content: center;");
    expect(styles).toContain(".android-auth-page .auth-otp__cell input");
    expect(styles).toContain("line-height: normal;");
  });
});
