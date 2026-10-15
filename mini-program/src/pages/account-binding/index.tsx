import { Text, View } from "@tarojs/components";
import Taro, { useDidHide, useDidShow } from "@tarojs/taro";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { androidAuthApi, AndroidAuthApiError, type AndroidCaptcha } from "../../api/android-auth-api";
import { googleServerClientId } from "../../api/product-api-config";
import { useAuthStore, type AppAuthUser } from "../../auth/auth-store";
import { AppButton } from "../../components/app-button";
import { PageLayout } from "../../layouts/page-layout";
import { getNativeGoogleIdToken } from "../../platform/google-auth";
import { useFeedbackStore } from "../../stores/feedback-store";
import { AuthInput, CaptchaField, PasswordInput, PhoneInput } from "../android-auth/auth-components";
import "../android-auth/index.scss";
import "./index.scss";

type ContactType = "email" | "phone";
type UserResponse = { user: AppAuthUser };

const returnToProfile = () => {
  useFeedbackStore.getState().closeModal();
  void Taro.switchTab({ url: "/pages/profile/index" });
};

const handleAndroidBack = () => {
  returnToProfile();
  return true;
};

export default function AccountBindingPage() {
  const { t } = useTranslation();
  const [user, setUser] = useState<AppAuthUser | null>(null);
  const [type, setType] = useState<ContactType | null>(null);
  const [target, setTarget] = useState("");
  const [sentTarget, setSentTarget] = useState("");
  const [captcha, setCaptcha] = useState<AndroidCaptcha | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [message, setMessage] = useState("");
  const showFeedbackModal = useFeedbackStore((state) => state.showModal);

  const showError = (title: string, variant: "error" | "limit" = "error") => {
    showFeedbackModal({ variant, title, primaryText: t("common.confirm") });
  };

  const updateUser = (next: AppAuthUser) => {
    setUser(next);
    const session = useAuthStore.getState().session;
    if (session) useAuthStore.getState().setSession({ ...session, user: next });
  };

  const load = async () => {
    try {
      const result = await androidAuthApi.getMe() as UserResponse;
      updateUser(result.user);
    } catch {
      showError(t("accountBinding.failed"));
    }
  };
  useDidShow(() => {
    void load();
    if (typeof window !== "undefined") window.__nordicAndroidBack = handleAndroidBack;
  });
  useDidHide(() => {
    if (typeof window !== "undefined" && window.__nordicAndroidBack === handleAndroidBack) delete window.__nordicAndroidBack;
  });

  useEffect(() => {
    if (cooldown <= 0) return undefined;
    const timer = setTimeout(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const errorMessage = (error: unknown) => {
    const code = error instanceof AndroidAuthApiError ? error.code : "";
    if (code === "AUTH_IDENTITY_OCCUPIED") return t("accountBinding.occupied");
    if (code === "AUTH_METHOD_ALREADY_BOUND") return t("accountBinding.alreadyBound");
    if (code === "AUTH_OTP_INVALID" || code === "AUTH_OTP_EXPIRED") return t("accountBinding.invalidCode");
    if (code === "AUTH_INVALID_REQUEST" || code === "AUTH_PASSWORD_REQUIRED") return t("accountBinding.invalidInput");
    if (code === "AUTH_RATE_LIMITED") return t("androidAuth.errors.rateLimited");
    return t("accountBinding.failed");
  };

  const choose = (next: ContactType) => {
    setType(next);
    setTarget(next === "email" ? user?.email ?? "" : "");
    setSentTarget("");
    setCaptcha(null);
    setCaptchaAnswer("");
    setCode("");
    setPassword("");
    setSent(false);
    setCooldown(0);
    setMessage("");
    void androidAuthApi.getCaptcha().then((value) => setCaptcha(value as AndroidCaptcha)).catch(() => showError(t("accountBinding.failed")));
  };

  const refreshCaptcha = (showFailure = true) => {
    setCaptcha(null);
    setCaptchaAnswer("");
    void androidAuthApi.getCaptcha().then((value) => setCaptcha(value as AndroidCaptcha)).catch(() => {
      if (showFailure) showError(t("accountBinding.failed"));
    });
  };

  const sendCode = async () => {
    if (cooldown > 0 || busy) return;
    if (!type || !captcha || !captchaAnswer.trim() || !target.trim() || (type === "phone" && !/^1[3-9]\d{9}$/.test(target.trim()))) {
      showError(t("accountBinding.invalidInput"));
      return;
    }
    const normalizedTarget = type === "phone" ? `+86${target.trim()}` : target.trim();
    setBusy(true);
    setMessage("");
    try {
      const result = await androidAuthApi.sendBindingCode(type, {
        [type]: normalizedTarget, captchaId: captcha.captchaId, captchaAnswer: captchaAnswer.trim(),
      }) as { resendAfter?: number };
      setSentTarget(normalizedTarget);
      setSent(true);
      setCooldown(result.resendAfter ?? 60);
      setMessage(t("accountBinding.codeSent"));
    } catch (error) {
      showError(errorMessage(error), error instanceof AndroidAuthApiError && error.code === "AUTH_RATE_LIMITED" ? "limit" : "error");
      refreshCaptcha(false);
    } finally { setBusy(false); }
  };

  const bindContact = async () => {
    if (!type || !/^\d{6}$/.test(code) || (!user?.hasPassword && (password.length < 8 || password.length > 128)) || busy) {
      showError(t("accountBinding.invalidInput"));
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = await androidAuthApi.bindContact(type, {
        [type]: sentTarget, code, ...(!user?.hasPassword ? { password } : {}),
      }) as UserResponse;
      updateUser(result.user);
      setType(null);
      setPassword("");
      showFeedbackModal({ variant: "success", title: t("accountBinding.success"), primaryText: t("common.confirm"), onPrimary: returnToProfile });
    } catch (error) { showError(errorMessage(error)); }
    finally { setBusy(false); }
  };

  const bindGoogle = async () => {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const idToken = await getNativeGoogleIdToken(googleServerClientId, true);
      const result = await androidAuthApi.bindGoogle(idToken) as UserResponse;
      updateUser(result.user);
      showFeedbackModal({ variant: "success", title: t("accountBinding.success"), primaryText: t("common.confirm"), onPrimary: returnToProfile });
    } catch (error) {
      showError(error instanceof AndroidAuthApiError ? errorMessage(error) : t("accountBinding.googleFailed"));
    } finally { setBusy(false); }
  };

  const methods = user?.loginMethods;
  return <PageLayout title="Nordic Nutri AI" showTabs={false} hideNavigation showBrandHeader={false} className="page-layout--account-binding">
    <View className="account-binding">
      <Text className="account-binding__back" onClick={returnToProfile}>{t("androidAuth.back")}</Text>
      <Text className="account-binding__title">{t("accountBinding.title")}</Text>
      <Text className="account-binding__intro">{t("accountBinding.intro")}</Text>
      {!user ? <Text>{t("androidAuth.connecting")}</Text> : (["email", "phone", "google"] as const).map((method) => <View className="account-binding__method" key={method}>
        <View className="account-binding__method-details">
          <Text className="account-binding__method-name">{method === "google" ? "Google" : t(method === "email" ? "androidAuth.email" : "androidAuth.phone")}</Text>
          <Text className="account-binding__method-status">{methods?.[method] ? (method === "email" ? user?.email : method === "phone" ? user?.phoneE164 : t("accountBinding.bound")) : t("accountBinding.notBound")}</Text>
        </View>
        {!methods?.[method] ? <Text className="account-binding__action" onClick={() => method === "google" ? void bindGoogle() : choose(method)}>{t(method === "email" ? "accountBinding.bindEmail" : method === "phone" ? "accountBinding.bindPhone" : "accountBinding.bindGoogle")}</Text> : null}
      </View>)}
      {type ? <View className="account-binding__form">
        {sent ? <Text>{sentTarget}</Text> : type === "phone" ? <PhoneInput value={target} onChange={setTarget} /> : <AuthInput label={t("androidAuth.email")} value={target} onChange={setTarget} placeholder="name@example.com" />}
        {!sent ? <><CaptchaField captcha={captcha} value={captchaAnswer} onChange={setCaptchaAnswer} onRefresh={refreshCaptcha} />
          <AppButton disabled={busy || cooldown > 0} onClick={() => void sendCode()}>{cooldown > 0 ? t("androidAuth.resendAfter", { count: cooldown }) : t("accountBinding.sendCode")}</AppButton></> : <>
          <AuthInput label={t("androidAuth.otpAria")} value={code} onChange={setCode} type="number" maxLength={6} />
          {!user?.hasPassword ? <><Text>{t("accountBinding.passwordHint")}</Text><PasswordInput label={t("accountBinding.newPassword")} value={password} onChange={setPassword} /></> : null}
          <AppButton disabled={busy} onClick={() => void bindContact()}>{t("accountBinding.confirm")}</AppButton>
          <Text className={`account-binding__action ${cooldown > 0 ? "account-binding__action--disabled" : ""}`} onClick={() => {
            if (cooldown > 0) return;
            setSent(false); setSentTarget(""); refreshCaptcha();
          }}>{cooldown > 0 ? t("androidAuth.resendAfter", { count: cooldown }) : t("androidAuth.resend")}</Text>
        </>}
      </View> : null}
      {message ? <Text className="account-binding__message">{message}</Text> : null}
    </View>
  </PageLayout>;
}
