import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AppCard } from "../../components/app-card";
import { NordicIcon, type NordicIconName } from "../../components/nordic-icon";
import { PageLayout } from "../../layouts/page-layout";
import {
  REMINDER_WINDOWS,
  isReminderTimeInWindow,
  type MealReminderType,
  type SmartReminderSettings,
} from "../../features/smart-reminders/domain";
import { smartReminderStorage } from "../../features/smart-reminders/storage";
import { refreshAndroidSmartReminders, requestAndroidReminderPermission } from "../../features/smart-reminders/coordinator";
import { useAuthStore } from "../../auth/auth-store";
import { useFeedbackStore } from "../../stores/feedback-store";
import { useProfileStore } from "../../stores/profile-store";
import { saveProductSettings } from "../../api/product-data-api";
import { syncSmartReminderSchedule } from "../../api/push-api";
import { ReminderTimeSheet } from "../../components/reminder-time-sheet";
import { ReminderAlarmModal } from "../../components/reminder-alarm-modal";
import { ReminderPausedModal } from "../../components/reminder-paused-modal";
import "./index.scss";

const mealRows: Array<{ type: MealReminderType; icon: NordicIconName }> = [
  { type: "breakfast", icon: "reminder-sunrise" },
  { type: "lunch", icon: "reminder-bowl" },
  { type: "dinner", icon: "reminder-tray" },
];

function ReminderToggle({ checked, label, size = "meal", onChange }: { checked: boolean; label: string; size?: "master" | "meal"; onChange: (checked: boolean) => void }) {
  const { t } = useTranslation();
  return (
    <View
      className={`reminder-toggle reminder-toggle--${size} ${checked ? "reminder-toggle--checked" : ""}`}
      ariaLabel={`${label}${checked ? t("smartReminders.toggleOn") : t("smartReminders.toggleOff")}`}
      onClick={() => onChange(!checked)}
    >
      <View className="reminder-toggle__thumb" />
    </View>
  );
}

export default function SmartReminderSettingsPage() {
  const { t } = useTranslation();
  const userId = useAuthStore((state) => state.user?.id ?? null);
  const profileSettings = useProfileStore((state) => state.settings);
  const showModal = useFeedbackStore((state) => state.showModal);
  const showFeedback = useFeedbackStore((state) => state.show);
  const [settings, setSettings] = useState<SmartReminderSettings | null>(null);
  const [editingMealType, setEditingMealType] = useState<MealReminderType | null>(null);
  const [alarmFeedback, setAlarmFeedback] = useState<{ title: string; mealName?: string; time?: string; enabled: boolean } | null>(null);
  const [scheduleInfoExpanded, setScheduleInfoExpanded] = useState(false);

  useEffect(() => {
    if (userId) {
      const loaded = smartReminderStorage.load(userId);
      setSettings(loaded);
      void syncSmartReminderSchedule(loaded).catch(() => undefined);
    }
  }, [userId]);

  const showPermissionError = () => showModal({
    variant: "error",
    title: t("smartReminders.permissionTitle"),
    description: t("smartReminders.permissionBody"),
    primaryText: t("smartReminders.okay"),
    dismissible: true,
  });

  const commit = (next: SmartReminderSettings, scope: "master" | MealReminderType, feedbackTitle?: string, feedbackDelay = 0) => {
    setSettings(next);
    if (userId) smartReminderStorage.save(userId, next);
    if (userId) {
      void syncSmartReminderSchedule(next).catch(() => {
        showFeedback({ message: t("smartReminders.scheduleSyncFailed"), tone: "error", presentation: "status" });
      });
    }
    if (userId && next.enabled !== settings?.enabled) {
      void saveProductSettings({ ...profileSettings, notification: next.enabled }).catch(() => {
        showFeedback({ message: t("smartReminders.toggleSyncFailed"), tone: "error", presentation: "status" });
      });
    }
    void refreshAndroidSmartReminders().then((success) => {
      if (!success) showFeedback({ message: t("smartReminders.notEffective"), tone: "error", presentation: "status" });
    });
    const label = scopeLabel(scope);
    const enabled = scopeValue(next, scope);
    const title = feedbackTitle ?? (scope === "master"
      ? t(enabled ? "smartReminders.allEnabled" : "smartReminders.allDisabled")
      : t(enabled ? "smartReminders.mealEnabled" : "smartReminders.mealDisabled", { meal: label }));
    const presentAlarm = () => setAlarmFeedback({
      title,
      enabled,
      mealName: scope === "master" ? undefined : label,
      time: scope === "master" ? undefined : next.meals[scope].time,
    });
    if (feedbackDelay > 0) {
      setTimeout(presentAlarm, feedbackDelay);
    } else {
      presentAlarm();
    }
  };

  const scopeLabel = (scope: "master" | MealReminderType) => {
    if (scope === "master") return t("smartReminders.title");
    return t(`meals.${scope}`);
  };
  const scopeValue = (next: SmartReminderSettings, scope: "master" | MealReminderType) => scope === "master" ? next.enabled : next.meals[scope].enabled;

  const toggle = async (scope: "master" | MealReminderType, checked: boolean) => {
    if (!settings) return;
    if (checked && !(await requestAndroidReminderPermission())) {
      showPermissionError();
      return;
    }
    if (scope === "master") {
      commit({ ...settings, enabled: checked }, scope);
      return;
    }
    commit({ ...settings, meals: { ...settings.meals, [scope]: { ...settings.meals[scope], enabled: checked } } }, scope);
  };

  const changeTime = (mealType: MealReminderType, time: string) => {
    if (!settings || !isReminderTimeInWindow(mealType, time)) {
      void Taro.showToast({ title: t("smartReminders.timeInvalid"), icon: "none" });
      return;
    }
     commit({ ...settings, meals: { ...settings.meals, [mealType]: { ...settings.meals[mealType], time } } }, mealType, t("smartReminders.timeAdjusted", { meal: t(`meals.${mealType}`) }), 320);
  };

  return (
    <PageLayout
      className="page-layout--smart-reminder"
      title="Nordic Nutri AI"
      showTabs={false}
      hideNavigation
      showBack
      onTopBarBack={() => { void Taro.navigateBack(); }}
    >
      <View className="smart-reminder-settings__screen">
        <View className="smart-reminder-settings">
          <View className="smart-reminder-settings__intro">
            <Text className="smart-reminder-settings__intro-title">{t("smartReminders.title")}</Text>
            <Text className="smart-reminder-settings__intro-subtitle">{t("smartReminders.subtitle")}</Text>
          </View>
        <AppCard tone="sage" className="smart-reminder-settings__master-card">
          <View className="smart-reminder-settings__master-copy">
            <View className="smart-reminder-settings__title-row">
              <View className="smart-reminder-settings__master-icon"><NordicIcon name="reminder-bell" size={22} ariaLabel={t("smartReminders.title")} /></View>
              <View>
                <Text className="smart-reminder-settings__title">{t("smartReminders.title")}</Text>
                <Text className="smart-reminder-settings__description">{t("smartReminders.description")}</Text>
              </View>
            </View>
            {settings ? <ReminderToggle checked={settings.enabled} label={t("smartReminders.title")} size="master" onChange={(checked) => { void toggle("master", checked); }} /> : null}
          </View>
        </AppCard>

        <View className="smart-reminder-settings__schedule-section">
          <View className="smart-reminder-settings__section-heading">
            <View className="smart-reminder-settings__section-title-group">
              <Text className="smart-reminder-settings__section-title">{t("smartReminders.schedule")}</Text>
              <View
                className="smart-reminder-settings__schedule-info-toggle"
                ariaLabel={t(scheduleInfoExpanded ? "smartReminders.collapse" : "smartReminders.expand")}
                onClick={() => setScheduleInfoExpanded((expanded) => !expanded)}
              >
                <Text className="smart-reminder-settings__schedule-info-label">{t(scheduleInfoExpanded ? "smartReminders.collapseAction" : "smartReminders.expandAction")}</Text>
                <View className={`smart-reminder-settings__schedule-info-chevron ${scheduleInfoExpanded ? "smart-reminder-settings__schedule-info-chevron--expanded" : ""}`} />
              </View>
            </View>
            <Text className="smart-reminder-settings__section-count">{settings ? t("smartReminders.enabledCount", { count: mealRows.filter(({ type }) => settings.meals[type].enabled).length }) : "—"}</Text>
          </View>
          <View className={`smart-reminder-settings__schedule-info ${scheduleInfoExpanded ? "smart-reminder-settings__schedule-info--expanded" : ""}`}>
            <View className="smart-reminder-settings__hint-icon">
              <NordicIcon name="reminder-leaf" size={16} ariaLabel={t("smartReminders.expand")} />
            </View>
            <Text>{t("smartReminders.scheduleHint")}</Text>
          </View>
          <AppCard className={`smart-reminder-settings__schedule-card ${settings?.enabled ? "" : "smart-reminder-settings__schedule-card--paused"}`}>
            {mealRows.map(({ type, icon }) => {
              const row = settings?.meals[type];
              const window = REMINDER_WINDOWS[type];
              const mealLabel = t(`meals.${type}`);
              return (
                <View className="smart-reminder-settings__meal-row" key={type}>
                  <View className="smart-reminder-settings__meal-main">
                    <View className={`smart-reminder-settings__meal-icon smart-reminder-settings__meal-icon--${type}`}><NordicIcon name={icon} size={22} ariaLabel={mealLabel} /></View>
                    <View className="smart-reminder-settings__row-copy">
                      <View className="smart-reminder-settings__meal-title-row">
                        <Text className="smart-reminder-settings__meal-name">{mealLabel}</Text>
                        <Text className="smart-reminder-settings__window-chip">{window.start}–{window.end}</Text>
                      </View>
                      {row?.enabled && settings?.enabled ? (
                        <View
                          className="smart-reminder-settings__time-row smart-reminder-settings__time-row--active"
                          ariaLabel={t("smartReminders.adjustTime", { meal: mealLabel })}
                          onClick={() => setEditingMealType(type)}
                        >
                          <Text className="smart-reminder-settings__time-label">{t("smartReminders.remindTime")}</Text>
                          <View className="smart-reminder-settings__time-chip">
                            <Text className="smart-reminder-settings__time-value">{row.time}</Text>
                            <Text className="smart-reminder-settings__time-action">{t("smartReminders.edit")}</Text>
                          </View>
                        </View>
                      ) : row ? <Text className="smart-reminder-settings__closed-text">{t("smartReminders.closed")}</Text> : null}
                    </View>
                  </View>
                  {row ? <ReminderToggle checked={row.enabled} label={mealLabel} onChange={(checked) => { void toggle(type, checked); }} /> : null}
                </View>
              );
            })}
          </AppCard>
        </View>

        <View className="smart-reminder-settings__footer">
          <View className="smart-reminder-settings__footer-line">
            <NordicIcon name="info" size={16} ariaLabel={t("smartReminders.footer")} />
            <Text>{t("smartReminders.footer")}</Text>
          </View>
          <Text className="smart-reminder-settings__footer-note">{t("smartReminders.footerNote")}</Text>
        </View>
        </View>
      </View>
       <ReminderTimeSheet
        open={Boolean(editingMealType)}
        mealType={editingMealType}
        time={editingMealType && settings ? settings.meals[editingMealType].time : "00:00"}
        onDismiss={() => setEditingMealType(null)}
        onConfirm={(time) => {
          if (editingMealType) changeTime(editingMealType, time);
          setEditingMealType(null);
         }}
       />
      <ReminderAlarmModal
        open={Boolean(alarmFeedback?.enabled)}
        title={alarmFeedback?.title ?? ""}
        mealName={alarmFeedback?.mealName}
        time={alarmFeedback?.time}
        onDismiss={() => setAlarmFeedback(null)}
      />
      <ReminderPausedModal
        open={alarmFeedback?.enabled === false}
        onDismiss={() => setAlarmFeedback(null)}
      />
    </PageLayout>
  );
}
