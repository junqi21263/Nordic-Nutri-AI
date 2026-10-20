import { Switch, Text, View } from "@tarojs/components";
import Taro, { useDidShow, useRouter } from "@tarojs/taro";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { PushNotifications } from "@capacitor/push-notifications";
import { PageLayout } from "../../layouts/page-layout";
import { AppButton } from "../../components/app-button";
import { navigateBackOrHome } from "../../utils/navigation";
import { useAuthStore } from "../../auth/auth-store";
import {
  getNotification,
  getNotifications,
  readNotification,
  getNotificationPreferences,
  saveNotificationPreferences,
  type NotificationItem,
  type NotificationPreferences,
} from "../../api/notification-api";
import "./index.scss";

export default function NotificationsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const userId = useAuthStore((s) => s.user?.id);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [detail, setDetail] = useState<NotificationItem | null>(null);
  const [kind, setKind] = useState("");
  const [total, setTotal] = useState(0);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    systemPush: true,
    feedbackPush: true,
  });
  const [permission, setPermission] = useState("");
  const [localTestResult, setLocalTestResult] = useState("");
  const requestVersion = useRef(0);
  const detailId = router.params.id;
  const settings = router.params.settings === "1";
  const android = process.env.TARO_APP_PLATFORM === "android";
  const load = async (offset = 0, filter = kind) => {
    const version = ++requestVersion.current;
    const owner = userId;
    setLoading(true);
    setError(false);
    try {
      if (!owner) {
        await Taro.navigateTo({ url: "/pages/android-auth/index" });
        return;
      }
      if (settings) {
        const value = await getNotificationPreferences();
        if (version !== requestVersion.current || useAuthStore.getState().user?.id !== owner)
          return;
        setPrefs(value);
        if (android) {
          const p = await PushNotifications.checkPermissions();
          setPermission(p.receive);
          if (p.receive === "granted") await PushNotifications.register();
        }
      } else if (detailId) {
        const n = await getNotification(detailId);
        if (version !== requestVersion.current || useAuthStore.getState().user?.id !== owner)
          return;
        setDetail(n);
        await readNotification(n.id);
      } else {
        const result = await getNotifications(offset, filter);
        if (version !== requestVersion.current || useAuthStore.getState().user?.id !== owner)
          return;
        setItems((previous) => (offset ? [...previous, ...result.items] : result.items));
        setTotal(result.total);
      }
    } catch {
      if (version === requestVersion.current) setError(true);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  };
  useDidShow(() => {
    setDetail(null);
    setItems([]);
    setTotal(0);
    void load();
  });
  const update = async (key: keyof NotificationPreferences, value: boolean) => {
    if (saving) return;
    setSaving(true);
    setError(false);
    try {
      setPrefs(await saveNotificationPreferences({ ...prefs, [key]: value }));
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };
  return (
    <PageLayout
      title={t(settings ? "notifications.settings" : "notifications.title")}
      showBack
      showTabs={false}
      action={android && !settings && !detailId ? `${t("notifications.settings")} ›` : undefined}
      onActionClick={() => void Taro.navigateTo({ url: "/pages/notifications/index?settings=1" })}
      onTopBarBack={() => navigateBackOrHome(detailId || settings ? "/pages/notifications/index" : "/pages/profile/index")}
      className="page-layout--notifications"
    >
      <View className="notifications">
        {error ? (
          <View className="notifications__notice">
            <Text>{t("notifications.error")}</Text>
            <AppButton variant="secondary" onClick={() => void load()}>
              {t("notifications.retry")}
            </AppButton>
          </View>
        ) : null}
        {settings ? (
          <>
            {android ? (
              <View className="notifications__card">
                <Text>
                  {t(
                    permission === "granted"
                      ? "notifications.permissionOn"
                      : "notifications.permissionOff",
                  )}
                </Text>
                <Text className="notifications__muted">{t("notifications.permissionHelp")}</Text>
                {permission !== "granted" ? (
                  <AppButton
                    variant="secondary"
                    onClick={() => {
                      if (permission === "denied" && window.NordicPushIntent?.openSettings) {
                        window.NordicPushIntent.openSettings();
                        return;
                      }
                      void PushNotifications.requestPermissions()
                        .then(async (p) => {
                          setPermission(p.receive);
                          if (p.receive === "granted") await PushNotifications.register();
                        })
                        .catch(() => setError(true));
                    }}
                  >
                    {t("notifications.enable")}
                  </AppButton>
                ) : null}
              </View>
            ) : null}
            {android && process.env.TARO_APP_ENV === "development" ? (
              <View className="notifications__card">
                <AppButton variant="secondary" onClick={() => {
                  try {
                    const result = window.NordicPushIntent?.testSystemNotification?.() ?? "unavailable";
                    setLocalTestResult(t(`notifications.localTestResults.${result}`));
                  } catch {
                    setLocalTestResult(t("notifications.localTestResults.unavailable"));
                  }
                }}>{t("notifications.localTest")}</AppButton>
                {localTestResult ? <Text className="notifications__muted">{localTestResult}</Text> : null}
              </View>
            ) : null}
            {(["systemPush", "feedbackPush"] as const).map((key) => (
              <View className="notifications__setting" key={key}>
                <Text>{t(`notifications.${key}`)}</Text>
                <Switch
                  color="#30483d"
                  checked={prefs[key]}
                  disabled={saving || loading || error}
                  onChange={(e) => void update(key, e.detail.value)}
                />
              </View>
            ))}
            <Text className="notifications__muted">{t("notifications.settingsHelp")}</Text>
          </>
        ) : detailId ? (
          detail ? (
            <View className="notifications__card">
              <Text className="notifications__title">{detail.title}</Text>
              <Text className="notifications__muted">
                {new Date(detail.created_at).toLocaleString()}
              </Text>
              {detail.feedback ? (
                <>
                  <Text className="notifications__label">{t("notifications.yourFeedback")}</Text>
                  <Text className="notifications__body">{detail.feedback.content}</Text>
                  <Text className="notifications__label">{t("notifications.reply")}</Text>
                  <Text className="notifications__body">{detail.feedback.admin_reply}</Text>
                </>
              ) : (
                <Text className="notifications__body">
                  {detail.body.split(/(https:\/\/[^\s<>]+)/g).map((part, index) =>
                    part.startsWith("https://") ? (
                      <Text
                        key={index}
                        style={{ textDecoration: "underline" }}
                        onClick={() => {
                          if (android && window.NordicPushIntent?.openLink)
                            window.NordicPushIntent.openLink(part);
                          else void Taro.setClipboardData({ data: part });
                        }}
                      >
                        {part}
                      </Text>
                    ) : (
                      part
                    ),
                  )}
                </Text>
              )}
            </View>
          ) : null
        ) : (
          <>
            <View className="notifications__filters">
              {["", "system", "feedback"].map((value) => (
                <AppButton
                  key={value || "all"}
                  variant={kind === value ? "primary" : "secondary"}
                  onClick={() => {
                    setKind(value);
                    setItems([]);
                    setTotal(0);
                    void load(0, value);
                  }}
                >
                  {t(`notifications.${value || "all"}`)}
                </AppButton>
              ))}
            </View>
            {!loading && !error && !items.length ? (
              <Text className="notifications__muted">{t("notifications.empty")}</Text>
            ) : null}
            {items.map((n) => (
              <View
                key={n.id}
                className="notifications__card"
                role="button"
                onClick={() =>
                  void Taro.navigateTo({ url: `/pages/notifications/index?id=${n.id}` })
                }
              >
                <View className="notifications__heading">
                  {!n.read_at ? <View className="notifications__dot" /> : null}
                  <Text className="notifications__title">{n.title}</Text>
                </View>
                <Text className="notifications__preview">{n.body}</Text>
                <Text className="notifications__muted">
                  {new Date(n.created_at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
                </Text>
              </View>
            ))}
            {items.length < total ? (
              <AppButton
                variant="secondary"
                disabled={loading}
                onClick={() => void load(items.length)}
              >
                {t("notifications.more")}
              </AppButton>
            ) : null}
          </>
        )}
      </View>
    </PageLayout>
  );
}
