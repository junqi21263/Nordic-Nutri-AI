import { Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
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
  return (
    <View
      className={`reminder-toggle reminder-toggle--${size} ${checked ? "reminder-toggle--checked" : ""}`}
      ariaLabel={`${label}${checked ? "已开启" : "已关闭"}`}
      onClick={() => onChange(!checked)}
    >
      <View className="reminder-toggle__thumb" />
    </View>
  );
}

export default function SmartReminderSettingsPage() {
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
    title: "通知权限未开启",
    description: "请在系统设置中允许 Nordic Nutri AI 发送通知，提醒才会生效。",
    primaryText: "知道了",
    dismissible: true,
  });

  const commit = (next: SmartReminderSettings, scope: "master" | MealReminderType, feedbackTitle?: string, feedbackDelay = 0) => {
    setSettings(next);
    if (userId) smartReminderStorage.save(userId, next);
    if (userId) {
      void syncSmartReminderSchedule(next).catch(() => {
        showFeedback({ message: "云端提醒排程同步失败，请稍后重试", tone: "error", presentation: "status" });
      });
    }
    if (userId && next.enabled !== settings?.enabled) {
      void saveProductSettings({ ...profileSettings, notification: next.enabled }).catch(() => {
        showFeedback({ message: "云端提醒开关同步失败，请稍后重试", tone: "error", presentation: "status" });
      });
    }
    void refreshAndroidSmartReminders().then((success) => {
      if (!success) showFeedback({ message: "提醒暂时未生效，请重试", tone: "error", presentation: "status" });
    });
    const label = scopeLabel(scope);
    const enabled = scopeValue(next, scope);
    const title = feedbackTitle ?? (scope === "master" ? (enabled ? "提醒已全部开启" : "已停用就餐提醒") : `${label}提醒已${enabled ? "开启" : "关闭"}`);
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
    if (scope === "master") return "记录提醒";
    return REMINDER_WINDOWS[scope].label;
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
      void Taro.showToast({ title: "请选择对应时间段内的时间", icon: "none" });
      return;
    }
     commit({ ...settings, meals: { ...settings.meals, [mealType]: { ...settings.meals[mealType], time } } }, mealType, `${REMINDER_WINDOWS[mealType].label}提醒已调整`, 320);
  };

  return (
    <PageLayout
      className="page-layout--smart-reminder"
      title="Nordic Nutri AI"
      showTabs={false}
      hideNavigation
      showBrandHeader={false}
    >
      <View className="smart-reminder-settings__screen">
        <View className="smart-reminder-settings__header">
          <View
            className="smart-reminder-settings__back"
            ariaLabel="返回"
            onClick={() => { void Taro.navigateBack(); }}
          >
            <NordicIcon name="back" size={20} ariaLabel="返回" />
          </View>
          <Text className="smart-reminder-settings__brand">Nordic Nutri AI</Text>
          <View className="smart-reminder-settings__header-spacer" />
        </View>
        <View className="smart-reminder-settings">
          <View className="smart-reminder-settings__intro">
            <Text className="smart-reminder-settings__intro-title">记录提醒</Text>
            <Text className="smart-reminder-settings__intro-subtitle">在需要的时候，轻轻提醒你。</Text>
          </View>
        <AppCard tone="sage" className="smart-reminder-settings__master-card">
          <View className="smart-reminder-settings__master-copy">
            <View className="smart-reminder-settings__title-row">
              <View className="smart-reminder-settings__master-icon"><NordicIcon name="reminder-bell" size={22} ariaLabel="记录提醒" /></View>
              <View>
                <Text className="smart-reminder-settings__title">记录提醒</Text>
                <Text className="smart-reminder-settings__description">餐次未记录时提醒</Text>
              </View>
            </View>
            {settings ? <ReminderToggle checked={settings.enabled} label="记录提醒" size="master" onChange={(checked) => { void toggle("master", checked); }} /> : null}
          </View>
        </AppCard>

        <View className="smart-reminder-settings__schedule-section">
          <View className="smart-reminder-settings__section-heading">
            <View className="smart-reminder-settings__section-title-group">
              <Text className="smart-reminder-settings__section-title">餐次推送排程</Text>
              <View
                className="smart-reminder-settings__schedule-info-toggle"
                ariaLabel={scheduleInfoExpanded ? "收起提醒说明" : "展开提醒说明"}
                onClick={() => setScheduleInfoExpanded((expanded) => !expanded)}
              >
                <Text className="smart-reminder-settings__schedule-info-label">{scheduleInfoExpanded ? "收起" : "展开"}</Text>
                <View className={`smart-reminder-settings__schedule-info-chevron ${scheduleInfoExpanded ? "smart-reminder-settings__schedule-info-chevron--expanded" : ""}`} />
              </View>
            </View>
            <Text className="smart-reminder-settings__section-count">{settings ? `已启用 ${mealRows.filter(({ type }) => settings.meals[type].enabled).length} 个提醒` : "—"}</Text>
          </View>
          <View className={`smart-reminder-settings__schedule-info ${scheduleInfoExpanded ? "smart-reminder-settings__schedule-info--expanded" : ""}`}>
            <View className="smart-reminder-settings__hint-icon">
              <NordicIcon name="reminder-leaf" size={16} ariaLabel="提醒说明" />
            </View>
            <Text>记录完成后，当天对应提醒会自动跳过。</Text>
          </View>
          <AppCard className={`smart-reminder-settings__schedule-card ${settings?.enabled ? "" : "smart-reminder-settings__schedule-card--paused"}`}>
            {mealRows.map(({ type, icon }) => {
              const row = settings?.meals[type];
              const window = REMINDER_WINDOWS[type];
              return (
                <View className="smart-reminder-settings__meal-row" key={type}>
                  <View className="smart-reminder-settings__meal-main">
                    <View className={`smart-reminder-settings__meal-icon smart-reminder-settings__meal-icon--${type}`}><NordicIcon name={icon} size={22} ariaLabel={window.label} /></View>
                    <View className="smart-reminder-settings__row-copy">
                      <View className="smart-reminder-settings__meal-title-row">
                        <Text className="smart-reminder-settings__meal-name">{window.label}</Text>
                        <Text className="smart-reminder-settings__window-chip">{window.start}–{window.end}</Text>
                      </View>
                      {row?.enabled && settings?.enabled ? (
                        <View
                          className="smart-reminder-settings__time-row smart-reminder-settings__time-row--active"
                          ariaLabel={`调整${window.label}提醒时间`}
                          onClick={() => setEditingMealType(type)}
                        >
                          <Text className="smart-reminder-settings__time-label">提醒于</Text>
                          <View className="smart-reminder-settings__time-chip">
                            <Text className="smart-reminder-settings__time-value">{row.time}</Text>
                            <Text className="smart-reminder-settings__time-action">修改 ›</Text>
                          </View>
                        </View>
                      ) : row ? <Text className="smart-reminder-settings__closed-text">该餐次已关闭提醒</Text> : null}
                    </View>
                  </View>
                  {row ? <ReminderToggle checked={row.enabled} label={window.label} onChange={(checked) => { void toggle(type, checked); }} /> : null}
                </View>
              );
            })}
          </AppCard>
        </View>

        <View className="smart-reminder-settings__footer">
          <View className="smart-reminder-settings__footer-line">
            <NordicIcon name="info" size={16} ariaLabel="提醒说明" />
            <Text>每个餐次每天最多提醒一次</Text>
          </View>
          <Text className="smart-reminder-settings__footer-note">记录完成后，该餐次当天将不再提醒。</Text>
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
