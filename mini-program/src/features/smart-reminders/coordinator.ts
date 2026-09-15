import type { ActionPerformed } from "@capacitor/local-notifications";
import { useAuthStore } from "../../auth/auth-store";
import { useMealStore } from "../../stores/meal-store";
import { buildTodayReminderCandidates, getReminderNotificationId, type ReminderCandidate } from "./domain";
import { smartReminderStorage, type SmartReminderStorage } from "./storage";
import { androidSmartReminderAdapter, type AndroidSmartReminderAdapter } from "../../platform/android-smart-reminders";

const reminderIds = [
  getReminderNotificationId("breakfast"),
  getReminderNotificationId("lunch"),
  getReminderNotificationId("dinner"),
];

interface CoordinatorDependencies {
  adapter: AndroidSmartReminderAdapter;
  storage: SmartReminderStorage;
  getUserId: () => string | null;
  getMeals: () => ReturnType<typeof useMealStore.getState>["meals"];
  now?: () => Date;
  navigate: (url: string) => void;
}

function defaultNavigate(url: string) {
  void import("@tarojs/taro").then(({ default: Taro }) => Taro.navigateTo({ url }));
}

function notificationRoute(action: ActionPerformed) {
  const extra = action.notification.extra as { mealType?: string; reminder?: boolean } | undefined;
  if (!extra?.reminder || !["breakfast", "lunch", "dinner"].includes(extra.mealType ?? "")) return null;
  return `/pages/manual-meal/index?mealType=${extra.mealType}&reminder=1`;
}

export function createSmartReminderCoordinator(dependencies: CoordinatorDependencies) {
  let actionListener: { remove: () => Promise<void> } | null = null;

  const requestPermission = () => dependencies.adapter.requestPermission();
  const cancel = async () => {
    if (!dependencies.adapter.isAvailable()) return;
    try {
      await dependencies.adapter.cancel(reminderIds);
    } catch {
      // Reminder cleanup must never block logout or account switching.
    }
  };
  const refresh = async () => {
    if (!dependencies.adapter.isAvailable()) return true;
    try {
      await dependencies.adapter.cancel(reminderIds);
      const userId = dependencies.getUserId();
      if (!userId) return true;
      const settings = dependencies.storage.load(userId);
      if (!settings.enabled || !(await requestPermission())) return true;
      const candidates = buildTodayReminderCandidates(settings, dependencies.getMeals(), dependencies.now?.() ?? new Date());
      await dependencies.adapter.schedule(candidates);
      return true;
    } catch {
      return false;
    }
  };
  const initialize = async () => {
    if (dependencies.adapter.isAvailable() && !actionListener) {
      actionListener = await dependencies.adapter.addActionListener((action) => {
        const route = notificationRoute(action);
        if (route) dependencies.navigate(route);
      });
    }
    return refresh();
  };
  const dispose = async () => {
    await actionListener?.remove();
    actionListener = null;
  };
  return { requestPermission, refresh, cancel, initialize, dispose };
}

const defaultCoordinator = createSmartReminderCoordinator({
  adapter: androidSmartReminderAdapter,
  storage: smartReminderStorage,
  getUserId: () => useAuthStore.getState().user?.id ?? null,
  getMeals: () => useMealStore.getState().meals,
  navigate: defaultNavigate,
});

export const initializeAndroidSmartReminders = () => defaultCoordinator.initialize();
export const refreshAndroidSmartReminders = () => defaultCoordinator.refresh();
export const cancelAndroidSmartReminders = () => defaultCoordinator.cancel();
export const requestAndroidReminderPermission = () => defaultCoordinator.requestPermission();

export type { ReminderCandidate };
