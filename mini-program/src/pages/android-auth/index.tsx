import { useTranslation } from "react-i18next";
import { t } from "../../i18n";
import Taro from "@tarojs/taro";
import { Text, View } from "@tarojs/components";
import { useEffect, useState } from "react";
import {
  androidAuthApi,
  type AndroidAuthSessionResult,
  type AndroidCaptcha,
  AndroidAuthApiError,
} from "../../api/android-auth-api";
import { googleServerClientId } from "../../api/product-api-config";
import { startApplicationAuth } from "../../auth/app-auth-bootstrap";
import { setNativeSession } from "../../auth/session-manager";
import { toAppSession } from "../../api/android-auth-api";
import { NordicIcon } from "../../components/nordic-icon";
import { PageLayout } from "../../layouts/page-layout";
import { getNativeGoogleIdToken, summarizeGoogleIdToken } from "../../platform/google-auth";
import { useFeedbackStore } from "../../stores/feedback-store";
import {
  AuthButton as AppButton,
  AuthHero,
  AuthInput,
  AuthNav,
  CaptchaField,
  InlineMessage,
  OtpInput,
  PasswordInput,
  PhoneInput,
} from "./auth-components";
import { getAuthBackState, getAuthInputError, getForgotPasswordView, type AuthView } from "./auth-state";
import "./index.scss";

declare global {
  interface Window {
    __nordicAndroidBack?: () => boolean;
  }
}

type SuccessKind = "login" | "register" | "reset";

function maskTarget(value: string, type: "email" | "phone") {
  if (type === "email") {
    const [name, domain] = value.split("@");
    return name && domain ? `${name.slice(0, 2)}•••@${domain}` : value;
  }
  const digits = value.replace(/\D/g, "");
  return digits.length > 4 ? `${value.slice(0, 3)} •••• ${digits.slice(-4)}` : value;
}

function userMessage(error: unknown, context: "default" | "google" = "default") {
  const code = error instanceof AndroidAuthApiError ? error.code : "";
  if (context === "google") {
    if (code === "AUTH_PROVIDER_UNAVAILABLE" || code === "AUTH_NETWORK_ERROR") return t("androidAuth.errors.googleUnavailable");
    if (code === "AUTH_INVALID_CREDENTIALS") return t("androidAuth.errors.googleCredential");
  }
  const messages: Record<string, string> = {
    AUTH_INVALID_REQUEST: t("androidAuth.errors.invalidRequest"),
    AUTH_INVALID_CREDENTIALS: t("androidAuth.errors.invalidCredentials"),
    AUTH_CAPTCHA_INVALID: t("androidAuth.errors.captchaInvalid"),
    AUTH_CAPTCHA_EXPIRED: t("androidAuth.errors.captchaExpired"),
    AUTH_OTP_INVALID: t("androidAuth.errors.otpInvalid"),
    AUTH_OTP_EXPIRED: t("androidAuth.errors.otpExpired"),
    AUTH_EMAIL_ALREADY_REGISTERED: t("androidAuth.errors.emailRegistered"),
    AUTH_PHONE_ALREADY_REGISTERED: t("androidAuth.errors.phoneRegistered"),
    AUTH_RATE_LIMITED: t("androidAuth.errors.rateLimited"),
    AUTH_PROVIDER_UNAVAILABLE: t("androidAuth.errors.codeUnavailable"),
    AUTH_NETWORK_ERROR: t("androidAuth.errors.network"),
  };
  if (code && messages[code]) return messages[code];
  return t("androidAuth.errors.failed");
}

function logSendCode(level: "info" | "warn" | "error", event: string, detail: Record<string, unknown> = {}) {
  console[level](`[android-auth] ${event}`, { scope: "android-auth", ...detail });
}

function phoneWithCountry(phone: string) {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) return trimmed.replace(/[\s().-]/g, "");
  return `+86${trimmed.replace(/\D/g, "")}`;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function requiresCaptcha(view: AuthView) {
  return view === "email-register" || view === "phone-register" || view === "forgot-email" || view === "forgot-phone";
}

export default function AndroidAuthPage() {
  useTranslation();
  const [view, setView] = useState<AuthView>("landing");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [captcha, setCaptcha] = useState<AndroidCaptcha | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [captchaError, setCaptchaError] = useState(false);
  const [successKind, setSuccessKind] = useState<SuccessKind>("login");
  const [successBackView, setSuccessBackView] = useState<AuthView>("email-login");
  const [resetMethod, setResetMethod] = useState<"email" | "phone">("email");
  const showFeedbackModal = useFeedbackStore((state) => state.showModal);

  const targetType = view === "reset-password" ? resetMethod : view.includes("phone") ? "phone" : "email";
  const isPhone = targetType === "phone";
  const isRegister = view.includes("register");
  const isOtp = view === "email-register-otp" || view === "phone-register-otp";
  const isRegisterPassword = view === "email-register-password" || view === "phone-register-password";
  const isLogin = view === "email-login" || view === "phone-login";

  const refreshCaptcha = async () => {
    try {
      setCaptcha((await androidAuthApi.getCaptcha()) as AndroidCaptcha);
      setCaptchaAnswer("");
      setCaptchaError(false);
    } catch (requestError) {
      setError(userMessage(requestError));
    }
  };

  const navigate = (next: AuthView) => {
    if (busy || next === view) return;
    setView(next);
    setError("");
    setSuccess("");
    setCaptchaError(false);
    setCode("");
    setPassword("");
    setConfirmPassword("");
    setCooldown(0);
    if (requiresCaptcha(next)) void refreshCaptcha();
  };

  const presentBlockingAuthError = (requestError: unknown) => {
    if (!(requestError instanceof AndroidAuthApiError)) return false;
    const { code } = requestError;
    if (code === "AUTH_RATE_LIMITED") {
      const dailyLimit = requestError.message.includes("今日");
      showFeedbackModal({
        variant: "limit",
        title: t(dailyLimit ? "androidAuth.limit.dailyTitle" : "androidAuth.limit.frequentTitle"),
        description: t(dailyLimit ? "androidAuth.limit.dailyDescription" : "androidAuth.limit.frequentDescription"),
        primaryText: t("androidAuth.gotIt"),
      });
      return true;
    }
    if (code === "AUTH_EMAIL_ALREADY_REGISTERED" || code === "AUTH_PHONE_ALREADY_REGISTERED") {
      const registeredByPhone = code === "AUTH_PHONE_ALREADY_REGISTERED";
      showFeedbackModal({
        variant: "error",
        title: t(registeredByPhone ? "androidAuth.errors.phoneRegistered" : "androidAuth.errors.emailRegistered"),
        description: t(registeredByPhone ? "androidAuth.registeredPhoneDescription" : "androidAuth.registeredEmailDescription"),
        primaryText: t("androidAuth.goToLogin"),
        secondaryText: t("common.cancel"),
        onPrimary: () => navigate(registeredByPhone ? "phone-login" : "email-login"),
      });
      return true;
    }
    return false;
  };

  const goBack = () => {
    const next = getAuthBackState(view, false, resetMethod);
    if (next.view !== view) navigate(next.view);
  };

  useEffect(() => {
    const handleBack = () => {
      if (view === "landing") return false;
      goBack();
      return true;
    };
    window.__nordicAndroidBack = handleBack;
    const onNativeBack = () => { handleBack(); };
    window.addEventListener("nordicAndroidBack", onNativeBack);
    return () => {
      window.removeEventListener("nordicAndroidBack", onNativeBack);
      if (window.__nordicAndroidBack === handleBack) delete window.__nordicAndroidBack;
    };
  }, [view, resetMethod]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    const insets = (window as Window & {
      NordicWelcomeInsets?: { setAuthLandingVisible?: (visible: boolean) => void };
    }).NordicWelcomeInsets;
    insets?.setAuthLandingVisible?.(view === "landing" || view === "google-connecting");
    return () => insets?.setAuthLandingVisible?.(false);
  }, [view]);

  const retrySessionLaunch = async () => {
    setError("");
    try {
      await startApplicationAuth({ force: true, allowSilentLogin: false });
    } catch {
      setError(t("androidAuth.errors.sessionLaunch"));
    }
  };

  const finishLogin = async (result: AndroidAuthSessionResult, kind: SuccessKind) => {
    setNativeSession(toAppSession(result));
    setSuccessKind(kind);
    setView("success");
    await delay(400);
    await retrySessionLaunch();
  };

  const signInWithGoogle = async () => {
    if (busy) return;
    setBusy(true);
    setView("google-connecting");
      setError("");
    try {
      const idToken = await getNativeGoogleIdToken(googleServerClientId);
      console.info("[android-auth][google-token-diagnostics]", summarizeGoogleIdToken(idToken, googleServerClientId));
      await finishLogin((await androidAuthApi.loginGoogle(idToken)) as AndroidAuthSessionResult, "login");
    } catch (requestError) {
      setView("landing");
      const message = userMessage(requestError, "google");
      setError(message === t("androidAuth.errors.failed") ? t("androidAuth.errors.googleLoginFailed") : message);
    } finally {
      setBusy(false);
    }
  };

  const sendCode = async () => {
    if (busy || cooldown > 0) return;
    if (isOtp || view === "reset-password") {
      navigate(view === "reset-password" ? successBackView : isPhone ? "phone-register" : "email-register");
      setSuccess(t("androidAuth.completeCaptchaRetry"));
      return;
    }
    logSendCode("info", "send-code:start", {
      targetType: isPhone ? "phone" : "email",
      flow: isRegister ? "register" : "reset",
      hasCaptchaId: Boolean(captcha?.captchaId),
      hasCaptchaAnswer: Boolean(captchaAnswer.trim()),
    });
    const inputError = getAuthInputError(targetType, isPhone ? phoneWithCountry(phone) : email, captcha?.captchaId, captchaAnswer);
    if (inputError) {
      logSendCode("warn", "send-code:blocked", { reason: inputError });
      setError(t(inputError));
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const target = isPhone ? phoneWithCountry(phone) : email;
      if (isRegister) {
        if (isPhone) {
          await androidAuthApi.sendPhoneCode({ phone: target, captchaId: captcha?.captchaId ?? "", captchaAnswer });
          setView("phone-register-otp");
        } else {
          await androidAuthApi.sendEmailCode({ email: target, captchaId: captcha?.captchaId ?? "", captchaAnswer });
          setView("email-register-otp");
        }
      } else if (isPhone) {
        await androidAuthApi.forgotPhone({ phone: target, captchaId: captcha?.captchaId ?? "", captchaAnswer });
        setResetMethod("phone");
        setView("reset-password");
        setSuccessBackView("forgot-phone");
      } else {
        await androidAuthApi.forgotEmail({ email: target, captchaId: captcha?.captchaId ?? "", captchaAnswer });
        setResetMethod("email");
        setView("reset-password");
        setSuccessBackView("forgot-email");
      }
      setCooldown(60);
      setSuccess(t("androidAuth.codeSent"));
    } catch (requestError) {
      logSendCode("error", "send-code:error", {
        errorName: requestError instanceof Error ? requestError.name : "UnknownError",
        errorCode: requestError instanceof AndroidAuthApiError ? requestError.code : undefined,
        errorMessage: requestError instanceof Error ? requestError.message : String(requestError),
      });
      if (!presentBlockingAuthError(requestError)) setError(userMessage(requestError));
      setCaptchaError(requestError instanceof AndroidAuthApiError && requestError.code.startsWith("AUTH_CAPTCHA"));
      await refreshCaptcha();
    } finally {
      setBusy(false);
    }
  };

  const validatePassword = () => {
    if (password.length < 8) {
      setError(t("androidAuth.validation.passwordMin"));
      return false;
    }
    if (password.length > 128) {
      setError(t("androidAuth.validation.passwordMax"));
      return false;
    }
    if (password !== confirmPassword) {
      setError(t("androidAuth.validation.passwordMismatch"));
      return false;
    }
    return true;
  };

  const submit = async () => {
    if (busy) return;
    if (isLogin) {
      const inputError = getAuthInputError(targetType, isPhone ? phoneWithCountry(phone) : email, undefined, "", false);
      if (inputError) { setError(t(inputError)); return; }
      if (!password) { setError(t("androidAuth.validation.passwordRequired")); return; }
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const target = isPhone ? phoneWithCountry(phone) : email;
      if (isLogin) {
        const result = isPhone
          ? await androidAuthApi.loginPhone({ phone: target, password })
          : await androidAuthApi.loginEmail({ email: target, password });
        await finishLogin(result as AndroidAuthSessionResult, "login");
      } else if (isOtp) {
        if (code.length !== 6) {
          setError(t("androidAuth.validation.otp"));
          return;
        }
        setError("");
        setSuccess("");
        setView(isPhone ? "phone-register-password" : "email-register-password");
      } else if (isRegisterPassword) {
        if (code.length !== 6) {
          setError(t("androidAuth.validation.otp"));
          return;
        }
        if (!validatePassword()) return;
        const result = isPhone
          ? await androidAuthApi.registerPhone({ phone: target, code, password })
          : await androidAuthApi.registerEmail({ email: target, code, password });
        await finishLogin(result as AndroidAuthSessionResult, "register");
      } else if (view === "reset-password") {
        if (code.length !== 6) {
          setError(t("androidAuth.validation.otp"));
          return;
        }
        if (!validatePassword()) return;
        await androidAuthApi.resetPassword(isPhone
          ? { targetType: "phone", phone: target, code, password }
          : { targetType: "email", email: target, code, password });
        setSuccessKind("reset");
        setView("success");
      }
    } catch (requestError) {
      if (!presentBlockingAuthError(requestError)) setError(userMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const verifyRegisterCode = () => {
    if (code.length !== 6) {
      setError(t("androidAuth.validation.otp"));
      return;
    }
    setError("");
    setSuccess("");
    setView(isPhone ? "phone-register-password" : "email-register-password");
  };

  const switchMethod = (nextMethod: "email" | "phone") => {
    if (nextMethod === targetType) return;
    const next = view.includes("register")
      ? `${nextMethod}-register`
      : view.includes("forgot")
        ? `forgot-${nextMethod}`
        : `${nextMethod}-login`;
    navigate(next as AuthView);
  };

  const renderLanding = () => (
    <View className="auth-landing">
      <AuthHero />
      <View className="auth-landing__content">
        <View className="auth-landing__intro">
          <Text className="auth-landing__title">{t("androidAuth.welcomeTitle")}</Text>
          <Text className="auth-landing__subtitle">{t("androidAuth.welcomeSubtitle")}</Text>
        </View>
        <AppButton size="large" variant="primary" loading={view === "google-connecting" || busy} onClick={() => void signInWithGoogle()}>
          <View className="auth-provider-content">
            <NordicIcon name="google" size={32} ariaLabel="" />
            <Text className="auth-provider-label">{view === "google-connecting" ? t("androidAuth.connecting") : t("androidAuth.googleLogin")}</Text>
          </View>
        </AppButton>
        <View className="auth-divider"><View className="auth-divider__line" /><Text>{t("androidAuth.chooseMethod")}</Text><View className="auth-divider__line" /></View>
        <View className="auth-landing__providers">
          <AppButton variant="outline" onClick={() => navigate("email-login")}>
            <View className="auth-provider-content">
              <NordicIcon name="mail" size={32} ariaLabel="" />
              <Text className="auth-provider-label">{t("androidAuth.email")}</Text>
            </View>
          </AppButton>
          <AppButton variant="outline" onClick={() => navigate("phone-login")}>
            <View className="auth-provider-content">
              <NordicIcon name="phone" size={32} ariaLabel="" />
              <Text className="auth-provider-label">{t("androidAuth.phone")}</Text>
            </View>
          </AppButton>
        </View>
        <View className="auth-create-account">
          <Text>{t("androidAuth.noAccount")}</Text>
          <Text className="auth-create-account__link" onClick={() => navigate("email-register")}>{t("androidAuth.registerNow")}</Text>
        </View>
        {error ? <InlineMessage message={error} kind="error" onRetry={error === t("androidAuth.errors.googleLoginFailed") ? () => void signInWithGoogle() : undefined} /> : null}
        <Text className="auth-terms">
          {t("androidAuth.termsLead")}
          <Text className="auth-terms__link" onClick={() => void Taro.navigateTo({ url: "/pages/terms-of-service/index" })}>{t("androidAuth.termsOfService")}</Text>
          {t("androidAuth.termsJoin")}
          <Text className="auth-terms__link" onClick={() => void Taro.navigateTo({ url: "/pages/privacy-policy/index" })}>{t("androidAuth.privacyPolicy")}</Text>
          {t("androidAuth.termsTail")}
        </Text>
      </View>
    </View>
  );

  const renderCaptcha = () => <CaptchaField captcha={captcha} value={captchaAnswer} error={captchaError} onChange={setCaptchaAnswer} onRefresh={() => void refreshCaptcha()} />;
  const renderTargetInput = () => isPhone
    ? <PhoneInput value={phone} onChange={setPhone} />
    : <AuthInput label={t("androidAuth.email")} value={email} placeholder={t("androidAuth.emailPlaceholder")} onChange={setEmail} />;

  const renderMethods = () => (
    <View className={`auth-methods ${isPhone ? "auth-methods--phone" : ""}`}>
      <View className="auth-methods__indicator" />
      <AppButton variant="ghost" active={!isPhone} disabled={busy} ariaLabel={t("androidAuth.useEmail")} onClick={() => switchMethod("email")}>{t("androidAuth.email")}</AppButton>
      <AppButton variant="ghost" active={isPhone} disabled={busy} ariaLabel={t("androidAuth.usePhone")} onClick={() => switchMethod("phone")}>{t("androidAuth.phone")}</AppButton>
    </View>
  );

  const renderLogin = () => (
    <View className="auth-form-shell auth-form-shell--login">
      {renderMethods()}
      {renderTargetInput()}
      <PasswordInput value={password} onChange={setPassword} />
      <AppButton size="large" loading={busy} onClick={() => void submit()}>{busy ? t("androidAuth.loggingIn") : t("androidAuth.login")}</AppButton>
      {error ? <InlineMessage message={error} kind="error" /> : null}
      <View className="auth-form__links">
        <Text onClick={() => navigate(getForgotPasswordView(targetType))}>{t("androidAuth.forgotPassword")}</Text>
        <Text onClick={() => navigate(isPhone ? "phone-register" : "email-register")}>{t("androidAuth.registerPrompt")}</Text>
      </View>
    </View>
  );

  const renderRegisterStart = () => (
    <View className="auth-form-shell auth-form-shell--register">
      {renderMethods()}
      {renderTargetInput()}
      {renderCaptcha()}
      <AppButton size="large" loading={busy} disabled={cooldown > 0} onClick={() => void sendCode()}>{busy ? t("androidAuth.sending") : cooldown > 0 ? t("androidAuth.resendAfter", { count: cooldown }) : t("androidAuth.getCode")}</AppButton>
      {error ? <InlineMessage message={error} kind="error" /> : null}
      <Text className="auth-switch">{t("androidAuth.haveAccount")}<Text onClick={() => navigate(isPhone ? "phone-login" : "email-login")}>{t("androidAuth.goToLogin")}</Text></Text>
    </View>
  );

  const renderOtp = () => (
    <View className="auth-form-shell auth-form-shell--otp">
      <View className="auth-form__step-row">
        <Text className="auth-form__eyebrow">{t(isPhone ? "androidAuth.verifyPhone" : "androidAuth.verifyEmail")}</Text>
        <Text className="auth-form__step">02 / 03</Text>
      </View>
      <Text className="auth-form__title">{t(isPhone ? "androidAuth.enterSmsCode" : "androidAuth.enterEmailCode")}</Text>
      <Text className="auth-form__copy">{t("androidAuth.codeSentTo", { target: maskTarget(isPhone ? phoneWithCountry(phone) : email, targetType) })}</Text>
      <OtpInput value={code} onChange={setCode} />
      <AppButton size="large" loading={busy} onClick={verifyRegisterCode}>{t("common.continue")}</AppButton>
      {success ? <InlineMessage message={success} kind="success" /> : null}
      {error ? <InlineMessage message={error} kind="error" /> : null}
      <View className="auth-form__links"><Text className={cooldown > 0 ? "auth-muted" : ""} onClick={() => void sendCode()}>{cooldown > 0 ? t("androidAuth.resendAfter", { count: cooldown }) : t("androidAuth.resend")}</Text><Text onClick={() => navigate(isPhone ? "phone-register" : "email-register")}>{t(isPhone ? "androidAuth.changePhone" : "androidAuth.changeEmail")}</Text></View>
    </View>
  );

  const renderRegisterPassword = () => (
    <View className="auth-form-shell auth-form-shell--register-password">
      <View className="auth-form__step-row">
        <Text className="auth-form__eyebrow">{t("androidAuth.setPassword")}</Text>
        <Text className="auth-form__step">03 / 03</Text>
      </View>
      <Text className="auth-form__title">{t("androidAuth.setLoginPassword")}</Text>
      <PasswordInput value={password} onChange={setPassword} />
      <PasswordInput label={t("androidAuth.confirmPassword")} value={confirmPassword} onChange={setConfirmPassword} />
      <AppButton size="large" loading={busy} onClick={() => void submit()}>{busy ? t("androidAuth.registering") : t("androidAuth.register")}</AppButton>
      {error ? <InlineMessage message={error} kind="error" /> : null}
    </View>
  );

  const renderForgot = () => (
    <View className="auth-form-shell auth-form-shell--forgot">
      <Text className="auth-form__eyebrow">{t("androidAuth.recoverAccount")}</Text>
      <Text className="auth-form__title">{t("androidAuth.recoverPassword")}</Text>
      {renderTargetInput()}
      {renderCaptcha()}
      <AppButton size="large" loading={busy} disabled={cooldown > 0} onClick={() => void sendCode()}>{busy ? t("androidAuth.sending") : cooldown > 0 ? t("androidAuth.resendAfter", { count: cooldown }) : t("androidAuth.getCode")}</AppButton>
      {error ? <InlineMessage message={error} kind="error" /> : null}
    </View>
  );

  const renderReset = () => (
    <View className="auth-form-shell auth-form-shell--reset">
      <Text className="auth-form__eyebrow">{t("androidAuth.setPassword")}</Text>
      <Text className="auth-form__title">{t("androidAuth.setNewPassword")}</Text>
      <Text className="auth-form__copy">{t("androidAuth.enterCodeSentTo", { target: maskTarget(isPhone ? phoneWithCountry(phone) : email, targetType) })}</Text>
      <OtpInput value={code} onChange={setCode} />
      <PasswordInput value={password} onChange={setPassword} />
      <PasswordInput label={t("androidAuth.confirmPassword")} value={confirmPassword} onChange={setConfirmPassword} />
      <AppButton size="large" loading={busy} onClick={() => void submit()}>{busy ? t("androidAuth.updating") : t("androidAuth.resetPassword")}</AppButton>
      {error ? <InlineMessage message={error} kind="error" /> : null}
      <View className="auth-form__links"><Text className={cooldown > 0 ? "auth-muted" : ""} onClick={() => void sendCode()}>{cooldown > 0 ? t("androidAuth.resendAfter", { count: cooldown }) : t("androidAuth.resend")}</Text><Text onClick={() => navigate(successBackView)}>{t("common.back")}</Text></View>
    </View>
  );

  const renderSuccess = () => (
    <View className="auth-success">
      <View className="auth-success__check" />
      <Text className="auth-success__title">{t(successKind === "register" ? "androidAuth.registerSuccess" : successKind === "reset" ? "androidAuth.passwordUpdated" : "androidAuth.welcomeBack")}</Text>
      <Text className="auth-success__copy">{t(successKind === "reset" ? "androidAuth.passwordUpdatedHint" : "androidAuth.healthyLife")}</Text>
      {error && successKind !== "reset" ? <><Text>{error}</Text><AppButton onClick={() => void retrySessionLaunch()}>{t("androidAuth.retryConnection")}</AppButton></> : null}
      {successKind === "reset" ? <AppButton size="large" onClick={() => navigate("landing")}>{t("androidAuth.backHome")}</AppButton> : null}
    </View>
  );

  const renderContent = () => {
    if (view === "landing" || view === "google-connecting") return renderLanding();
    if (view === "success") return <View className="auth-success-page"><AuthHero /><View className="auth-success-shell">{renderSuccess()}</View></View>;
    return <><AuthHero compact muted /><AuthNav onBack={goBack} />{isLogin ? renderLogin() : view === "email-register" || view === "phone-register" ? renderRegisterStart() : isOtp ? renderOtp() : isRegisterPassword ? renderRegisterPassword() : view === "reset-password" ? renderReset() : renderForgot()}</>;
  };

  return (
    <PageLayout title="Nordic Nutri AI" showTabs={false} hideNavigation showBrandHeader={false} className={`page-layout--android-auth page-layout--auth-view-${view}`}>
      <View className="android-auth-page"><View className={`auth-view auth-view--${isPhone ? "phone" : "email"}`}>{renderContent()}</View></View>
    </PageLayout>
  );
}
