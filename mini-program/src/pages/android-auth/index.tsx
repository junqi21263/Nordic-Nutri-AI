import { Image, Input, Text, View } from "@tarojs/components";
import { useEffect, useState } from "react";
import {
  androidAuthApi,
  type AndroidAuthSessionResult,
  type AndroidCaptcha,
} from "../../api/android-auth-api";
import { googleServerClientId } from "../../api/product-api-config";
import { startApplicationAuth } from "../../auth/app-auth-bootstrap";
import { setNativeSession } from "../../auth/session-manager";
import { AppButton } from "../../components/app-button";
import { PageLayout } from "../../layouts/page-layout";
import { getNativeGoogleIdToken } from "../../platform/google-auth";
import "./index.scss";

type AuthMode = "login" | "register" | "forgot";
type AuthMethod = "email" | "phone";

function valueOf(event: { detail?: { value?: string } }) {
  return event.detail?.value ?? "";
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") {
    return error.message;
  }
  return "操作未完成，请稍后重试";
}

export default function AndroidAuthPage() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [method, setMethod] = useState<AuthMethod>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [code, setCode] = useState("");
  const [captcha, setCaptcha] = useState<AndroidCaptcha | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const signInWithGoogle = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const idToken = await getNativeGoogleIdToken(googleServerClientId);
      await finishLogin((await androidAuthApi.loginGoogle(idToken)) as AndroidAuthSessionResult);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

  const refreshCaptcha = async () => {
    try {
      setCaptcha((await androidAuthApi.getCaptcha()) as AndroidCaptcha);
      setCaptchaAnswer("");
    } catch (requestError) {
      setError(errorMessage(requestError));
    }
  };

  useEffect(() => {
    void refreshCaptcha();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const finishLogin = async (result: AndroidAuthSessionResult) => {
    setNativeSession(result.user, result.session.accessToken);
    await startApplicationAuth({ force: true, allowSilentLogin: false });
  };

  const sendCode = async () => {
    if (busy || cooldown > 0) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const result = mode === "register"
        ? method === "email"
          ? await androidAuthApi.sendEmailCode({ email, captchaId: captcha?.captchaId ?? "", captchaAnswer })
          : await androidAuthApi.sendPhoneCode({ phone, captchaId: captcha?.captchaId ?? "", captchaAnswer })
        : method === "email"
          ? await androidAuthApi.forgotEmail({ email, captchaId: captcha?.captchaId ?? "", captchaAnswer })
          : await androidAuthApi.forgotPhone({ phone, captchaId: captcha?.captchaId ?? "", captchaAnswer });
      if (result) {
        setCodeSent(true);
        setCooldown(60);
        setSuccess(mode === "register"
          ? method === "email" ? "Check your email for the 6-digit verification code." : "Check your phone for the 6-digit verification code."
          : "If an account exists, we've sent a verification code.");
      }
    } catch (requestError) {
      setError(errorMessage(requestError));
      await refreshCaptcha();
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (busy || (mode !== "login" && !codeSent)) return;
    if (mode !== "login" && password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      if (mode === "login") {
        await finishLogin((await (method === "email" ? androidAuthApi.loginEmail({
          email,
          password,
          captchaId: captcha?.captchaId ?? "",
          captchaAnswer,
        }) : androidAuthApi.loginPhone({
          phone,
          password,
          captchaId: captcha?.captchaId ?? "",
          captchaAnswer,
        }))) as AndroidAuthSessionResult);
      } else if (mode === "register") {
        await finishLogin((await (method === "email"
          ? androidAuthApi.registerEmail({ email, code, password })
          : androidAuthApi.registerPhone({ phone, code, password }))) as AndroidAuthSessionResult);
      } else {
        await androidAuthApi.resetPassword(method === "email" ? { targetType: "email", email, code, password } : { targetType: "phone", phone, code, password });
        setMode("login");
        setCode("");
        setPassword("");
        setConfirmPassword("");
        setCodeSent(false);
        setSuccess("Password reset. You can sign in now.");
        await refreshCaptcha();
      }
    } catch (requestError) {
      setError(errorMessage(requestError));
      if (mode === "login" || mode === "forgot") await refreshCaptcha();
    } finally {
      setBusy(false);
    }
  };

  const switchMode = (next: AuthMode, nextMethod = method) => {
    setMode(next);
    setMethod(nextMethod);
    setEmail("");
    setPhone("");
    setPassword("");
    setConfirmPassword("");
    setCode("");
    setCodeSent(false);
    setCooldown(0);
    setError("");
    setSuccess("");
    void refreshCaptcha();
  };

  const isLogin = mode === "login";
  const isRegistration = mode === "register";
  const target = method === "email" ? email : phone;

  return (
    <PageLayout
      title="Nordic Nutri AI"
      showTabs={false}
      hideNavigation
      showBrandHeader={false}
      className="page-layout--android-auth"
    >
      <View className="android-auth-page">
        <Text className="android-auth-page__brand">Nordic</Text>
        {isLogin && (
          <AppButton size="large" variant="outline" loading={busy} onClick={() => void signInWithGoogle()}>
          Continue with Google
          </AppButton>
        )}

        <View className="android-auth-page__providers">
          <Text className={method === "email" ? "active" : ""} onClick={() => setMethod("email")}>Email</Text>
          <Text className={method === "phone" ? "active" : ""} onClick={() => setMethod("phone")}>Phone</Text>
        </View>

        <Text className="android-auth-page__title">
          {isLogin ? "Welcome back" : isRegistration ? "Create account" : "Forgot password"}
        </Text>

        <Input
          className="android-auth-page__input"
          value={target}
          placeholder={method === "email" ? "Email" : "Phone (+country code)"}
          type="text"
          onInput={(event) => method === "email" ? setEmail(valueOf(event)) : setPhone(valueOf(event))}
        />

        {!isLogin && !codeSent && (
          <View className="android-auth-page__captcha">
            <Input
              className="android-auth-page__input"
              value={captchaAnswer}
              placeholder="Image CAPTCHA"
              onInput={(event) => setCaptchaAnswer(valueOf(event))}
            />
            {captcha && (
              <Image
                src={`data:image/svg+xml,${encodeURIComponent(captcha.image)}`}
                mode="heightFix"
                onClick={() => void refreshCaptcha()}
              />
            )}
          </View>
        )}

        {isLogin && (
          <>
            <Input
              className="android-auth-page__input"
              password
              value={password}
              placeholder="Password"
              onInput={(event) => setPassword(valueOf(event))}
            />
            <View className="android-auth-page__captcha">
              <Input
                className="android-auth-page__input"
                value={captchaAnswer}
                placeholder="Image CAPTCHA"
                onInput={(event) => setCaptchaAnswer(valueOf(event))}
              />
              {captcha && (
                <Image
                  src={`data:image/svg+xml,${encodeURIComponent(captcha.image)}`}
                  mode="heightFix"
                  onClick={() => void refreshCaptcha()}
                />
              )}
            </View>
          </>
        )}

        {!isLogin && codeSent && (
          <>
            <Input
              className="android-auth-page__input"
              value={code}
              placeholder="6-digit verification code"
              type="number"
              onInput={(event) => setCode(valueOf(event))}
            />
            <Input
              className="android-auth-page__input"
              password
              value={password}
              placeholder="Password"
              onInput={(event) => setPassword(valueOf(event))}
            />
            <Input
              className="android-auth-page__input"
              password
              value={confirmPassword}
              placeholder="Confirm password"
              onInput={(event) => setConfirmPassword(valueOf(event))}
            />
          </>
        )}

        {!isLogin && !codeSent && (
          <AppButton variant="secondary" loading={busy} disabled={cooldown > 0} onClick={() => void sendCode()}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Send verification code"}
          </AppButton>
        )}
        {!isLogin && codeSent && (
          <AppButton variant="secondary" loading={busy} disabled={cooldown > 0} onClick={() => void sendCode()}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend verification code"}
          </AppButton>
        )}
        <AppButton size="large" loading={busy} disabled={!isLogin && !codeSent} onClick={() => void submit()}>
          {isLogin ? "Sign in" : isRegistration ? "Create account" : "Reset password"}
        </AppButton>

        {success && <Text className="android-auth-page__success">{success}</Text>}
        {error && <Text className="android-auth-page__error">{error}</Text>}
        <View className="android-auth-page__links">
          {isLogin ? (
            <>
              <Text onClick={() => switchMode("forgot")}>Forgot password?</Text>
              <Text onClick={() => switchMode("register")}>Create account</Text>
            </>
          ) : (
            <Text onClick={() => switchMode("login")}>Back to sign in</Text>
          )}
        </View>
      </View>
    </PageLayout>
  );
}
