import { Image, Input, Text, View } from "@tarojs/components";
import { useEffect, useState } from "react";
import {
  androidAuthApi,
  type AndroidCaptcha,
  type AndroidAuthSessionResult,
} from "../../api/android-auth-api";
import { setNativeSession } from "../../auth/session-manager";
import { startApplicationAuth } from "../../auth/app-auth-bootstrap";
import { AppButton } from "../../components/app-button";
import { PageLayout } from "../../layouts/page-layout";
import { getGoogleIdToken } from "../../platform/google-credential-manager";
import "./index.scss";

type AuthMode = "login" | "register-email" | "register-phone" | "forgot-email" | "forgot-phone";

function valueOf(event: { detail?: { value?: string } }) {
  return event.detail?.value ?? "";
}

function errorMessage(error: unknown) {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string")
    return error.message;
  return "操作未完成，请稍后重试";
}

export default function AndroidAuthPage() {
  const [mode, setMode] = useState<AuthMode>("login");
  const [loginType, setLoginType] = useState<"email" | "phone">("email");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [captcha, setCaptcha] = useState<AndroidCaptcha | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [error, setError] = useState("");

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
    if (cooldown > 0 || busy) return;
    setBusy(true);
    setError("");
    try {
      const result =
        mode === "register-email"
          ? await androidAuthApi.sendEmailCode({
              email: identifier,
              captchaId: captcha?.captchaId ?? "",
              captchaAnswer,
            })
          : mode === "register-phone"
            ? await androidAuthApi.sendPhoneCode({
                phone: identifier,
                captchaId: captcha?.captchaId ?? "",
                captchaAnswer,
              })
            : loginType === "email"
              ? await androidAuthApi.forgotEmail({
                  email: identifier,
                  captchaId: captcha?.captchaId ?? "",
                  captchaAnswer,
                })
              : await androidAuthApi.forgotPhone({
                  phone: identifier,
                  captchaId: captcha?.captchaId ?? "",
                  captchaAnswer,
                });
      if (result) setCooldown(60);
    } catch (requestError) {
      setError(errorMessage(requestError));
      await refreshCaptcha();
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "login") {
        const result =
          loginType === "email"
            ? await androidAuthApi.loginEmail({
                email: identifier,
                password,
                captchaId: captcha?.captchaId ?? "",
                captchaAnswer,
              })
            : await androidAuthApi.loginPhone({
                phone: identifier,
                password,
                captchaId: captcha?.captchaId ?? "",
                captchaAnswer,
              });
        await finishLogin(result as AndroidAuthSessionResult);
      } else if (mode === "register-email") {
        await finishLogin(
          (await androidAuthApi.registerEmail({
            email: identifier,
            code,
            password,
          })) as AndroidAuthSessionResult,
        );
      } else if (mode === "register-phone") {
        await finishLogin(
          (await androidAuthApi.registerPhone({
            phone: identifier,
            code,
            password,
          })) as AndroidAuthSessionResult,
        );
      } else {
        await androidAuthApi.resetPassword({
          target: identifier,
          targetType: mode === "forgot-email" ? "email" : "phone",
          code,
          password,
        });
        setMode("login");
        setCode("");
        setPassword("");
        await refreshCaptcha();
      }
    } catch (requestError) {
      setError(errorMessage(requestError));
      if (mode === "login" || mode.startsWith("forgot")) await refreshCaptcha();
    } finally {
      setBusy(false);
    }
  };

  const isCodeMode = mode !== "login";
  const isForgot = mode.startsWith("forgot");
  const switchMode = (next: AuthMode) => {
    setMode(next);
    setIdentifier("");
    setPassword("");
    setCode("");
    setError("");
    setCooldown(0);
    void refreshCaptcha();
  };

  const googleLogin = async () => {
    setBusy(true);
    setError("");
    try {
      await finishLogin(
        (await androidAuthApi.loginGoogle(await getGoogleIdToken())) as AndroidAuthSessionResult,
      );
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  };

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
        {mode === "login" && (
          <AppButton
            size="large"
            variant="outline"
            loading={busy}
            onClick={() => void googleLogin()}
          >
            Continue with Google
          </AppButton>
        )}
        <View className="android-auth-page__tabs">
          <Text
            className={loginType === "email" ? "active" : ""}
            onClick={() => setLoginType("email")}
          >
            Email
          </Text>
          <Text
            className={loginType === "phone" ? "active" : ""}
            onClick={() => setLoginType("phone")}
          >
            Phone
          </Text>
        </View>
        <Input
          className="android-auth-page__input"
          value={identifier}
          placeholder={loginType === "email" ? "Email" : "Phone (+country code)"}
          onInput={(event) => setIdentifier(valueOf(event))}
        />
        <Input
          className="android-auth-page__input"
          password
          value={password}
          placeholder={isForgot ? "New password" : "Password"}
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
        {isCodeMode && (
          <Input
            className="android-auth-page__input"
            type="number"
            value={code}
            placeholder="6-digit verification code"
            onInput={(event) => setCode(valueOf(event))}
          />
        )}
        {isCodeMode && (
          <AppButton variant="secondary" disabled={cooldown > 0} onClick={() => void sendCode()}>
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Send verification code"}
          </AppButton>
        )}
        <AppButton size="large" loading={busy} onClick={() => void submit()}>
          {isForgot ? "Reset password" : mode === "login" ? "Sign In" : "Create account"}
        </AppButton>
        {error && <Text className="android-auth-page__error">{error}</Text>}
        <View className="android-auth-page__links">
          {mode === "login" ? (
            <>
              <Text
                onClick={() => switchMode(loginType === "email" ? "forgot-email" : "forgot-phone")}
              >
                Forgot password?
              </Text>
              <Text onClick={() => switchMode("register-email")}>Create account</Text>
            </>
          ) : (
            <>
              <Text onClick={() => switchMode("login")}>Back to sign in</Text>
              {(mode === "register-email" || mode === "register-phone") && (
                <Text
                  onClick={() =>
                    switchMode(mode === "register-email" ? "register-phone" : "register-email")
                  }
                >
                  {mode === "register-email" ? "Use phone" : "Use email"}
                </Text>
              )}
            </>
          )}
        </View>
      </View>
    </PageLayout>
  );
}
