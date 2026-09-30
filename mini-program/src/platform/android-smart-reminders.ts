import { Capacitor } from "@capacitor/core";
import { LocalNotifications, type ActionPerformed } from "@capacitor/local-notifications";
import type { ReminderCandidate } from "../features/smart-reminders/domain";

const channelId = "meal-reminders";

export interface AndroidSmartReminderAdapter {
  isAvailable: () => boolean;
  requestPermission: () => Promise<boolean>;
  schedule: (candidates: ReminderCandidate[]) => Promise<void>;
  cancel: (ids: number[]) => Promise<void>;
  addActionListener: (listener: (action: ActionPerformed) => void) => Promise<{ remove: () => Promise<void> }>;
}

export const androidSmartReminderAdapter: AndroidSmartReminderAdapter = {
  isAvailable: () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android",
  requestPermission: async () => {
    if (!androidSmartReminderAdapter.isAvailable()) return false;
    const current = await LocalNotifications.checkPermissions();
    if (current.display === "granted") return true;
    const requested = await LocalNotifications.requestPermissions();
    return requested.display === "granted";
  },
  schedule: async (candidates) => {
    if (!androidSmartReminderAdapter.isAvailable() || !candidates.length) return;
    const { t } = await import("../i18n");
    await LocalNotifications.createChannel({
      id: channelId,
      name: t("smartReminders.title"),
      description: t("smartReminders.description"),
      importance: 3,
    });
    await LocalNotifications.schedule({
      notifications: candidates.map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        body: candidate.body,
        channelId,
        schedule: { at: candidate.at, allowWhileIdle: true },
        isExactNotification: true,
        extra: { mealType: candidate.mealType, reminder: true },
      })),
    });
  },
  cancel: async (ids) => {
    if (!androidSmartReminderAdapter.isAvailable() || !ids.length) return;
    await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
  },
  addActionListener: async (listener) => {
    if (!androidSmartReminderAdapter.isAvailable()) return { remove: async () => undefined };
    return LocalNotifications.addListener("localNotificationActionPerformed", listener);
  },
};
