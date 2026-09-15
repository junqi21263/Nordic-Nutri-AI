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
import { getAuthBackState, getAuthInputError, type AuthView } from "./auth-state";
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
    if (code === "AUTH_PROVIDER_UNAVAILABLE" || code === "AUTH_NETWORK_ERROR") return "Google 登录服务暂不可用，请稍后重试";
    if (code === "AUTH_INVALID_CREDENTIALS") return "Google 登录凭证无效，请重试";
  }
  const messages: Record<string, string> = {
    AUTH_INVALID_REQUEST: "输入信息有误，请检查邮箱或手机号格式后重试",
    AUTH_INVALID_CREDENTIALS: "账号或密码不正确",
    AUTH_CAPTCHA_INVALID: "图形验证码不正确，请重新输入",
    AUTH_CAPTCHA_EXPIRED: "图形验证码已过期，请刷新",
    AUTH_OTP_INVALID: "验证码不正确",
    AUTH_OTP_EXPIRED: "验证码已过期，请重新获取",
    AUTH_EMAIL_ALREADY_REGISTERED: "该邮箱已注册，请直接登录",
    AUTH_PHONE_ALREADY_REGISTERED: "该手机号已注册，请直接登录",
    AUTH_RATE_LIMITED: "操作过于频繁，请稍后重试",
    AUTH_PROVIDER_UNAVAILABLE: "验证码发送失败，请稍后重试",
    AUTH_NETWORK_ERROR: "连接失败，请检查网络后重试",
  };
  if (code && messages[code]) return messages[code];
  return "操作失败，请稍后重试";
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
        title: dailyLimit ? "今日验证码已达上限" : "验证码发送过于频繁",
        description: dailyLimit ? "今日发送次数已用完，请明日再试。" : "请求间隔太短，请稍后再试。",
        primaryText: "知道了",
      });
      return true;
    }
    if (code === "AUTH_EMAIL_ALREADY_REGISTERED" || code === "AUTH_PHONE_ALREADY_REGISTERED") {
      const registeredByPhone = code === "AUTH_PHONE_ALREADY_REGISTERED";
      showFeedbackModal({
        variant: "error",
        title: registeredByPhone ? "该手机号已注册" : "该邮箱已注册",
        description: `无需重复注册，请直接使用${registeredByPhone ? "手机号" : "邮箱"}和密码登录。`,
        primaryText: "去登录",
        secondaryText: "取消",
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
      setError("连接暂不可用，登录状态已保留，请重试");
    }
  };

  const finishLogin = async (result: AndroidAuthSessionResult, kind: SuccessKind) => {
    setNativeSession(result.user, result.session.accessToken);
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
      setError(message === "操作失败，请稍后重试" ? "登录失败，请重试" : message);
    } finally {
      setBusy(false);
    }
  };

  const sendCode = async () => {
    if (busy || cooldown > 0) return;
    if (isOtp || view === "reset-password") {
      navigate(view === "reset-password" ? successBackView : isPhone ? "phone-register" : "email-register");
      setSuccess("请完成图形验证后重新获取验证码");
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
      setError(inputError);
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
      setSuccess("验证码已发送");
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
      setError("密码至少需要 8 位");
      return false;
    }
    if (password.length > 128) {
      setError("密码不能超过 128 位");
      return false;
    }
    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return false;
    }
    return true;
  };

  const submit = async () => {
    if (busy) return;
    if (isLogin) {
      const inputError = getAuthInputError(targetType, isPhone ? phoneWithCountry(phone) : email, undefined, "", false);
      if (inputError) { setError(inputError); return; }
      if (!password) { setError("请输入密码"); return; }
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
          setError("请输入 6 位验证码");
          return;
        }
        setError("");
        setSuccess("");
        setView(isPhone ? "phone-register-password" : "email-register-password");
      } else if (isRegisterPassword) {
        if (code.length !== 6) {
          setError("请输入 6 位验证码");
          return;
        }
        if (!validatePassword()) return;
        const result = isPhone
          ? await androidAuthApi.registerPhone({ phone: target, code, password })
          : await androidAuthApi.registerEmail({ email: target, code, password });
        await finishLogin(result as AndroidAuthSessionResult, "register");
      } else if (view === "reset-password") {
        if (code.length !== 6) {
          setError("请输入 6 位验证码");
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
      setError("请输入 6 位验证码");
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
          <Text className="auth-landing__title">欢迎来到 Nordic Nutri</Text>
          <Text className="auth-landing__subtitle">读懂每一餐，让健康生活更简单。</Text>
        </View>
        <AppButton size="large" variant="primary" loading={view === "google-connecting" || busy} onClick={() => void signInWithGoogle()}>
          <View className="auth-provider-content">
            <NordicIcon name="google" size={32} ariaLabel="" />
            <Text className="auth-provider-label">{view === "google-connecting" ? "连接中…" : "使用 Google 登录"}</Text>
          </View>
        </AppButton>
        <View className="auth-divider"><View className="auth-divider__line" /><Text>或选择以下方式</Text><View className="auth-divider__line" /></View>
        <View className="auth-landing__providers">
          <AppButton variant="outline" onClick={() => navigate("email-login")}>
            <View className="auth-provider-content">
              <NordicIcon name="mail" size={32} ariaLabel="" />
              <Text className="auth-provider-label">邮箱</Text>
            </View>
          </AppButton>
          <AppButton variant="outline" onClick={() => navigate("phone-login")}>
            <View className="auth-provider-content">
              <NordicIcon name="phone" size={32} ariaLabel="" />
              <Text className="auth-provider-label">手机号</Text>
            </View>
          </AppButton>
        </View>
        <View className="auth-create-account">
          <Text>还没有账号？</Text>
          <Text className="auth-create-account__link" onClick={() => navigate("email-register")}>立即注册帐号</Text>
        </View>
        {error ? <InlineMessage message={error} kind="error" onRetry={error.includes("登录失败") ? () => void signInWithGoogle() : undefined} /> : null}
        <Text className="auth-terms">继续即表示你同意 Nordic 的<Text>服务条款</Text>和<Text>隐私政策</Text>。</Text>
      </View>
    </View>
  );

  const renderCaptcha = () => <CaptchaField captcha={captcha} value={captchaAnswer} error={captchaError} onChange={setCaptchaAnswer} onRefresh={() => void refreshCaptcha()} />;
  const renderTargetInput = () => isPhone
    ? <PhoneInput value={phone} onChange={setPhone} />
    : <AuthInput label="邮箱地址" value={email} placeholder="请输入邮箱地址" onChange={setEmail} />;

  const renderMethods = () => (
    <View className={`auth-methods ${isPhone ? "auth-methods--phone" : ""}`}>
      <View className="auth-methods__indicator" />
      <AppButton variant="ghost" active={!isPhone} disabled={busy} ariaLabel="使用邮箱" onClick={() => switchMethod("email")}>邮箱</AppButton>
      <AppButton variant="ghost" active={isPhone} disabled={busy} ariaLabel="使用手机号" onClick={() => switchMethod("phone")}>手机号</AppButton>
    </View>
  );

  const renderLogin = () => (
    <View className="auth-form-shell auth-form-shell--login">
      {renderMethods()}
      {renderTargetInput()}
      <PasswordInput value={password} onChange={setPassword} />
      <AppButton size="large" loading={busy} onClick={() => void submit()}>{busy ? "登录中…" : "登录"}</AppButton>
      {error ? <InlineMessage message={error} kind="error" /> : null}
      <View className="auth-form__links"><Text onClick={() => navigate(isPhone ? "forgot-phone" : "forgot-email")}>忘记密码？</Text><Text onClick={() => navigate(isPhone ? "phone-register" : "email-register")}>还没有账号？立即注册</Text></View>
    </View>
  );

  const renderRegisterStart = () => (
    <View className="auth-form-shell auth-form-shell--register">
      {renderMethods()}
      {renderTargetInput()}
      {renderCaptcha()}
      <AppButton size="large" loading={busy} disabled={cooldown > 0} onClick={() => void sendCode()}>{busy ? "发送中…" : cooldown > 0 ? `${cooldown} 秒后重新获取` : "获取验证码"}</AppButton>
      {error ? <InlineMessage message={error} kind="error" /> : null}
      <Text className="auth-switch">已有账号？<Text onClick={() => navigate(isPhone ? "phone-login" : "email-login")}>去登录</Text></Text>
    </View>
  );

  const renderOtp = () => (
    <View className="auth-form-shell auth-form-shell--otp">
      <View className="auth-form__step-row">
        <Text className="auth-form__eyebrow">{isPhone ? "验证手机号" : "验证邮箱"}</Text>
        <Text className="auth-form__step">02 / 03</Text>
      </View>
      <Text className="auth-form__title">{isPhone ? "输入短信验证码" : "输入邮箱验证码"}</Text>
      <Text className="auth-form__copy">验证码已发送至 {maskTarget(isPhone ? phoneWithCountry(phone) : email, targetType)}</Text>
      <OtpInput value={code} onChange={setCode} />
      <AppButton size="large" loading={busy} onClick={verifyRegisterCode}>下一步</AppButton>
      {success ? <InlineMessage message={success} kind="success" /> : null}
      {error ? <InlineMessage message={error} kind="error" /> : null}
      <View className="auth-form__links"><Text className={cooldown > 0 ? "auth-muted" : ""} onClick={() => void sendCode()}>{cooldown > 0 ? `${cooldown} 秒后重新获取` : "重新获取"}</Text><Text onClick={() => navigate(isPhone ? "phone-register" : "email-register")}>更换{isPhone ? "手机号" : "邮箱"}</Text></View>
    </View>
  );

  const renderRegisterPassword = () => (
    <View className="auth-form-shell auth-form-shell--register-password">
      <View className="auth-form__step-row">
        <Text className="auth-form__eyebrow">设置密码</Text>
        <Text className="auth-form__step">03 / 03</Text>
      </View>
      <Text className="auth-form__title">设置登录密码</Text>
      <PasswordInput value={password} onChange={setPassword} />
      <PasswordInput label="确认密码" value={confirmPassword} onChange={setConfirmPassword} />
      <AppButton size="large" loading={busy} onClick={() => void submit()}>{busy ? "注册中…" : "注册账号"}</AppButton>
      {error ? <InlineMessage message={error} kind="error" /> : null}
    </View>
  );

  const renderForgot = () => (
    <View className="auth-form-shell auth-form-shell--forgot">
      <Text className="auth-form__eyebrow">找回账号</Text>
      <Text className="auth-form__title">找回密码</Text>
      {renderTargetInput()}
      {renderCaptcha()}
      <AppButton size="large" loading={busy} disabled={cooldown > 0} onClick={() => void sendCode()}>{busy ? "发送中…" : cooldown > 0 ? `${cooldown} 秒后重新获取` : "获取验证码"}</AppButton>
      {error ? <InlineMessage message={error} kind="error" /> : null}
    </View>
  );

  const renderReset = () => (
    <View className="auth-form-shell auth-form-shell--reset">
      <Text className="auth-form__eyebrow">设置密码</Text>
      <Text className="auth-form__title">设置新密码</Text>
      <Text className="auth-form__copy">请输入发送至 {maskTarget(isPhone ? phoneWithCountry(phone) : email, targetType)} 的验证码</Text>
      <OtpInput value={code} onChange={setCode} />
      <PasswordInput value={password} onChange={setPassword} />
      <PasswordInput label="确认密码" value={confirmPassword} onChange={setConfirmPassword} />
      <AppButton size="large" loading={busy} onClick={() => void submit()}>{busy ? "更新中…" : "重置密码"}</AppButton>
      {error ? <InlineMessage message={error} kind="error" /> : null}
      <View className="auth-form__links"><Text className={cooldown > 0 ? "auth-muted" : ""} onClick={() => void sendCode()}>{cooldown > 0 ? `${cooldown} 秒后重新获取` : "重新获取"}</Text><Text onClick={() => navigate(successBackView)}>返回</Text></View>
    </View>
  );

  const renderSuccess = () => (
    <View className="auth-success">
      <View className="auth-success__check" />
      <Text className="auth-success__title">{successKind === "register" ? "注册成功" : successKind === "reset" ? "密码已更新" : "欢迎回来"}</Text>
      <Text className="auth-success__copy">{successKind === "reset" ? "密码已更新，请使用新密码登录" : "开启你的健康生活"}</Text>
      {error && successKind !== "reset" ? <><Text>{error}</Text><AppButton onClick={() => void retrySessionLaunch()}>重试连接</AppButton></> : null}
      {successKind === "reset" ? <AppButton size="large" onClick={() => navigate("landing")}>返回首页</AppButton> : null}
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
