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
import { AppButton } from "../../components/app-button";
import { PageLayout } from "../../layouts/page-layout";
import { getNativeGoogleIdToken } from "../../platform/google-auth";
import {
  AuthHero,
  AuthInput,
  AuthNav,
  CaptchaField,
  CountryPicker,
  InlineMessage,
  OtpInput,
  PasswordInput,
  type Country,
} from "./auth-components";
import { getAuthBackState, type AuthView } from "./auth-state";
import "./index.scss";

declare global {
  interface Window {
    __nordicAndroidBack?: () => boolean;
  }
}

type SuccessKind = "login" | "register" | "reset";
const DEFAULT_COUNTRY: Country = { name: "Japan", code: "+81" };

function maskTarget(value: string, type: "email" | "phone") {
  if (type === "email") {
    const [name, domain] = value.split("@");
    return name && domain ? `${name.slice(0, 2)}•••@${domain}` : value;
  }
  const digits = value.replace(/\D/g, "");
  return digits.length > 4 ? `${value.slice(0, 3)} •••• ${digits.slice(-4)}` : value;
}

function userMessage(error: unknown) {
  const code = error instanceof AndroidAuthApiError ? error.code : "";
  const messages: Record<string, string> = {
    AUTH_INVALID_CREDENTIALS: "Incorrect email or password.",
    AUTH_CAPTCHA_INVALID: "The security code is incorrect.",
    AUTH_CAPTCHA_EXPIRED: "The security code has expired.",
    AUTH_OTP_INVALID: "That code is incorrect.",
    AUTH_OTP_EXPIRED: "That code has expired.",
    AUTH_EMAIL_ALREADY_REGISTERED: "This email is already registered.",
    AUTH_PHONE_ALREADY_REGISTERED: "This phone number is already registered.",
    AUTH_RATE_LIMITED: "Too many requests. Please try again in a few minutes.",
    AUTH_PROVIDER_UNAVAILABLE: "We couldn't send the code.",
    AUTH_NETWORK_ERROR: "Connection problem. Please check your connection and try again.",
  };
  if (code && messages[code]) return messages[code];
  if (error instanceof Error && error.message) return error.message;
  return "Something went wrong. Please try again.";
}

function phoneWithCountry(phone: string, country: Country) {
  const trimmed = phone.trim();
  if (trimmed.startsWith("+")) return trimmed.replace(/[\s().-]/g, "");
  return `${country.code}${trimmed.replace(/\D/g, "")}`;
}

function delay(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export default function AndroidAuthPage() {
  const [view, setView] = useState<AuthView>("landing");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [captcha, setCaptcha] = useState<AndroidCaptcha | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [captchaError, setCaptchaError] = useState(false);
  const [successKind, setSuccessKind] = useState<SuccessKind>("login");
  const [successBackView, setSuccessBackView] = useState<AuthView>("email-login");
  const [resetMethod, setResetMethod] = useState<"email" | "phone">("email");

  const targetType = view === "reset-password" ? resetMethod : view.includes("phone") ? "phone" : "email";
  const isPhone = targetType === "phone";
  const isRegister = view === "email-register" || view === "phone-register" || view.endsWith("-register-otp");
  const isOtp = view === "email-register-otp" || view === "phone-register-otp";
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
    setView(next);
    setError("");
    setSuccess("");
    setCaptchaError(false);
    setCode("");
    setPassword("");
    setConfirmPassword("");
    setCooldown(0);
    if (next !== "landing" && next !== "success") void refreshCaptcha();
  };

  const goBack = () => {
    const next = getAuthBackState(view, pickerOpen, resetMethod);
    if (next.closePicker) {
      setPickerOpen(false);
      return;
    }
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
  }, [view, pickerOpen, resetMethod]);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const finishLogin = async (result: AndroidAuthSessionResult, kind: SuccessKind) => {
    setNativeSession(result.user, result.session.accessToken);
    setSuccessKind(kind);
    setView("success");
    await delay(400);
    await startApplicationAuth({ force: true, allowSilentLogin: false });
  };

  const signInWithGoogle = async () => {
    if (busy) return;
    setBusy(true);
    setView("google-connecting");
    setError("");
    try {
      const idToken = await getNativeGoogleIdToken(googleServerClientId);
      await finishLogin((await androidAuthApi.loginGoogle(idToken)) as AndroidAuthSessionResult, "login");
    } catch (requestError) {
      setView("landing");
      const message = userMessage(requestError);
      setError(message === "Something went wrong. Please try again." ? "We couldn't sign you in. Try again." : message);
    } finally {
      setBusy(false);
    }
  };

  const sendCode = async () => {
    if (busy || cooldown > 0) return;
    if (isOtp || view === "reset-password") {
      navigate(view === "reset-password" ? successBackView : isPhone ? "phone-register" : "email-register");
      setSuccess("Complete the security check to resend the code.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const target = isPhone ? phoneWithCountry(phone, country) : email;
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
      setSuccess("Code sent.");
    } catch (requestError) {
      setError(userMessage(requestError));
      setCaptchaError(requestError instanceof AndroidAuthApiError && requestError.code.startsWith("AUTH_CAPTCHA"));
      await refreshCaptcha();
    } finally {
      setBusy(false);
    }
  };

  const validatePassword = () => {
    if (password.length < 8) {
      setError("At least 8 characters.");
      return false;
    }
    if (password.length > 128) {
      setError("Password must be 128 characters or fewer.");
      return false;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return false;
    }
    return true;
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const target = isPhone ? phoneWithCountry(phone, country) : email;
      if (isLogin) {
        const result = isPhone
          ? await androidAuthApi.loginPhone({ phone: target, password, captchaId: captcha?.captchaId ?? "", captchaAnswer })
          : await androidAuthApi.loginEmail({ email: target, password, captchaId: captcha?.captchaId ?? "", captchaAnswer });
        await finishLogin(result as AndroidAuthSessionResult, "login");
      } else if (isOtp) {
        if (code.length !== 6) {
          setError("Enter the 6-digit code.");
          return;
        }
        if (!validatePassword()) return;
        const result = isPhone
          ? await androidAuthApi.registerPhone({ phone: target, code, password })
          : await androidAuthApi.registerEmail({ email: target, code, password });
        await finishLogin(result as AndroidAuthSessionResult, "register");
      } else if (view === "reset-password") {
        if (code.length !== 6) {
          setError("Enter the 6-digit code.");
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
      setError(userMessage(requestError));
      if (isLogin) await refreshCaptcha();
    } finally {
      setBusy(false);
    }
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
        <View className="auth-tag"><Text className="auth-tag__mark" /><Text>Mindful Nutrition</Text></View>
        <Text className="auth-landing__title">Welcome to Nordic</Text>
        <Text className="auth-landing__subtitle">A simpler way to understand what you eat.</Text>
        <AppButton size="large" variant="outline" loading={view === "google-connecting" || busy} onClick={() => void signInWithGoogle()}>
          <Text className="auth-google-mark">G</Text>
          <Text>{view === "google-connecting" ? "Connecting..." : "Continue with Google"}</Text>
        </AppButton>
        <View className="auth-divider"><View className="auth-divider__line" /><Text>OR CONTINUE WITH</Text><View className="auth-divider__line" /></View>
        <View className="auth-landing__providers">
          <AppButton variant="outline" onClick={() => navigate("email-login")}><Text className="auth-provider-icon auth-provider-icon--email" /><Text>Email</Text></AppButton>
          <AppButton variant="outline" onClick={() => navigate("phone-login")}><Text className="auth-provider-icon auth-provider-icon--phone" /><Text>Phone</Text></AppButton>
        </View>
        {error ? <InlineMessage message={error} kind="error" onRetry={error.includes("sign you in") ? () => void signInWithGoogle() : undefined} /> : null}
        <Text className="auth-terms">By continuing, you agree to Nordic's <Text>Terms of Service</Text> and <Text>Privacy Policy</Text>.</Text>
      </View>
    </View>
  );

  const renderCaptcha = () => <CaptchaField captcha={captcha} value={captchaAnswer} error={captchaError} onChange={setCaptchaAnswer} onRefresh={() => void refreshCaptcha()} />;
  const renderCountry = () => (
    <View className="auth-field"><Text className="auth-field__label">Country / Region</Text><View className="auth-country-trigger" onClick={() => setPickerOpen(true)}><Text>{country.name}</Text><Text>{country.code}</Text></View></View>
  );

  const renderLogin = () => (
    <View className="auth-form-shell">
      <Text className="auth-form__eyebrow">WELCOME BACK</Text>
      <Text className="auth-form__title">Sign in with {targetType}</Text>
      {isPhone ? renderCountry() : null}
      <AuthInput label={isPhone ? "Phone number" : "Email address"} value={isPhone ? phone : email} placeholder={isPhone ? "Phone number" : "you@example.com"} onChange={isPhone ? setPhone : setEmail} />
      <PasswordInput value={password} onChange={setPassword} />
      {renderCaptcha()}
      <AppButton size="large" loading={busy} onClick={() => void submit()}>{busy ? "Signing in..." : "Sign in"}</AppButton>
      {error ? <InlineMessage message={error} kind="error" /> : null}
      <View className="auth-form__links"><Text onClick={() => navigate(isPhone ? "forgot-phone" : "forgot-email")}>Forgot password?</Text><Text onClick={() => navigate(isPhone ? "phone-register" : "email-register")}>New to Nordic? Create account</Text></View>
      <Text className="auth-switch" onClick={() => switchMethod(isPhone ? "email" : "phone")}>Use {isPhone ? "email" : "phone"} instead</Text>
    </View>
  );

  const renderRegisterStart = () => (
    <View className="auth-form-shell">
      <Text className="auth-form__eyebrow">CREATE YOUR ACCOUNT</Text>
      <Text className="auth-form__title">Create your account</Text>
      {isPhone ? renderCountry() : null}
      <AuthInput label={isPhone ? "Phone number" : "Email address"} value={isPhone ? phone : email} placeholder={isPhone ? "Phone number" : "you@example.com"} onChange={isPhone ? setPhone : setEmail} />
      {renderCaptcha()}
      <AppButton size="large" loading={busy} disabled={cooldown > 0} onClick={() => void sendCode()}>{busy ? "Sending code..." : cooldown > 0 ? `Resend code in ${cooldown}s` : "Send verification code"}</AppButton>
      {error ? <InlineMessage message={error} kind="error" /> : null}
      <Text className="auth-switch">Already have an account? <Text onClick={() => navigate(isPhone ? "phone-login" : "email-login")}>Sign in</Text></Text>
    </View>
  );

  const renderOtp = () => (
    <View className="auth-form-shell">
      <Text className="auth-form__eyebrow">{isPhone ? "ENTER YOUR CODE" : "CHECK YOUR EMAIL"}</Text>
      <Text className="auth-form__title">{isPhone ? "Enter your code" : "Check your email"}</Text>
      <Text className="auth-form__copy">We sent a 6-digit code to {maskTarget(isPhone ? phoneWithCountry(phone, country) : email, targetType)}.</Text>
      <OtpInput value={code} onChange={setCode} />
      <PasswordInput value={password} onChange={setPassword} />
      <PasswordInput label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} />
      <AppButton size="large" loading={busy} onClick={() => void submit()}>{busy ? "Creating account..." : "Create account"}</AppButton>
      {success ? <InlineMessage message={success} kind="success" /> : null}
      {error ? <InlineMessage message={error} kind="error" /> : null}
      <View className="auth-form__links"><Text className={cooldown > 0 ? "auth-muted" : ""} onClick={() => void sendCode()}>{cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}</Text><Text onClick={() => navigate(isPhone ? "phone-register" : "email-register")}>Change {isPhone ? "phone number" : "email"}</Text></View>
    </View>
  );

  const renderForgot = () => (
    <View className="auth-form-shell">
      <Text className="auth-form__eyebrow">RESET ACCESS</Text>
      <Text className="auth-form__title">Forgot password</Text>
      {isPhone ? renderCountry() : null}
      <AuthInput label={isPhone ? "Phone number" : "Email address"} value={isPhone ? phone : email} placeholder={isPhone ? "Phone number" : "you@example.com"} onChange={isPhone ? setPhone : setEmail} />
      {renderCaptcha()}
      <AppButton size="large" loading={busy} disabled={cooldown > 0} onClick={() => void sendCode()}>{busy ? "Sending code..." : cooldown > 0 ? `Resend code in ${cooldown}s` : "Send verification code"}</AppButton>
      {error ? <InlineMessage message={error} kind="error" /> : null}
    </View>
  );

  const renderReset = () => (
    <View className="auth-form-shell">
      <Text className="auth-form__eyebrow">NEW PASSWORD</Text>
      <Text className="auth-form__title">Set a new password</Text>
      <Text className="auth-form__copy">Enter the code we sent to {maskTarget(isPhone ? phoneWithCountry(phone, country) : email, targetType)}.</Text>
      <OtpInput value={code} onChange={setCode} />
      <PasswordInput value={password} onChange={setPassword} />
      <PasswordInput label="Confirm password" value={confirmPassword} onChange={setConfirmPassword} />
      <AppButton size="large" loading={busy} onClick={() => void submit()}>{busy ? "Updating password..." : "Reset password"}</AppButton>
      {error ? <InlineMessage message={error} kind="error" /> : null}
      <View className="auth-form__links"><Text className={cooldown > 0 ? "auth-muted" : ""} onClick={() => void sendCode()}>{cooldown > 0 ? `Resend code in ${cooldown}s` : "Resend code"}</Text><Text onClick={() => navigate(successBackView)}>Back</Text></View>
    </View>
  );

  const renderSuccess = () => (
    <View className="auth-success">
      <View className="auth-success__check" />
      <Text className="auth-success__title">{successKind === "register" ? "Account created" : successKind === "reset" ? "Password updated" : "Welcome back"}</Text>
      <Text className="auth-success__copy">{successKind === "reset" ? "Your password has been changed." : "Your Nordic journey continues."}</Text>
      {successKind === "reset" ? <AppButton size="large" onClick={() => navigate(successBackView)}>Back to sign in</AppButton> : null}
    </View>
  );

  const renderContent = () => {
    if (view === "landing" || view === "google-connecting") return renderLanding();
    if (view === "success") return <><AuthHero compact muted /><View className="auth-success-shell">{renderSuccess()}</View></>;
    return <><AuthHero compact muted /><AuthNav onBack={goBack} />{isLogin ? renderLogin() : view === "email-register" || view === "phone-register" ? renderRegisterStart() : isOtp ? renderOtp() : view === "reset-password" ? renderReset() : renderForgot()}</>;
  };

  return (
    <PageLayout title="Nordic Nutri AI" showTabs={false} hideNavigation showBrandHeader={false} className={`page-layout--android-auth page-layout--auth-view-${view}`}>
      <View className="android-auth-page">{renderContent()}</View>
      <CountryPicker open={pickerOpen} selected={country} onDismiss={() => setPickerOpen(false)} onSelect={setCountry} />
    </PageLayout>
  );
}
