import type { ActionPerformed } from "@capacitor/push-notifications";
import { useAuthStore } from "../../auth/auth-store";
import { acknowledgeAndroidPushDelivery, registerAndroidPushToken, unregisterAndroidPushToken as unregisterAndroidPushTokenApi } from "../../api/push-api";
import { androidPushNotificationAdapter, type AndroidPushNotificationAdapter, type NativePushIntent } from "../../platform/android-push-notifications";
import { pendingReminderStorage } from "./pending-reminder";
import { getReminderMealType, mealRecordsRoute } from "./push-navigation";

let currentToken: string | null = null;
let initialized = false;

function defaultNavigate(url: string) {
  return import("@tarojs/taro").then(({ default: Taro }) => Taro.switchTab({ url }));
}

export function createAndroidPushCoordinator(adapter: AndroidPushNotificationAdapter, deps = {
  getSession: () => useAuthStore.getState().session,
  registerToken: registerAndroidPushToken,
  unregisterToken: unregisterAndroidPushTokenApi,
  acknowledgeDelivery: acknowledgeAndroidPushDelivery,
  savePendingReminder: pendingReminderStorage.save,
  prepareNavigation: () => import("../../auth/app-auth-bootstrap").then(({ startApplicationAuth }) => startApplicationAuth()),
  navigate: defaultNavigate,
}) {
  const deliveryIdFrom = (value: unknown) => {
    const data = (value as { data?: unknown })?.data;
    const deliveryId = data && typeof data === "object" && typeof (data as { deliveryId?: unknown }).deliveryId === "string"
      ? (data as { deliveryId: string }).deliveryId.trim()
      : "";
    return deliveryId || null;
  };
  const sync = async () => {
    const token = currentToken;
    if (!token || !deps.getSession()?.accessToken) return false;
    try {
      await deps.registerToken(token);
      return true;
    } catch {
      return false;
    }
  };
  return {
    initialize: async () => {
      if (!adapter.isAvailable()) return false;
      if (initialized) return true;
      initialized = true;
      return adapter.initialize({
        onToken: async (token) => {
          currentToken = token;
          await sync();
        },
        onNotification: async (notification) => {
          const deliveryId = deliveryIdFrom(notification);
          if (deliveryId) await deps.acknowledgeDelivery(deliveryId, "received").catch(() => {});
        },
        onAction: async (action) => {
          const deliveryId = deliveryIdFrom(action.notification);
          if (deliveryId) {
            await deps.acknowledgeDelivery(deliveryId, "displayed").catch(() => {});
            await deps.acknowledgeDelivery(deliveryId, "opened").catch(() => {});
          }
          const mealType = getReminderMealType(action);
          if (mealType) {
            deps.savePendingReminder(mealType);
            await deps.prepareNavigation();
            await deps.navigate(mealRecordsRoute);
          }
        },
        onLaunchIntent: async (intent: NativePushIntent) => {
          await deps.acknowledgeDelivery(intent.deliveryId, "opened").catch(() => {});
          if (intent.mealType === "breakfast" || intent.mealType === "lunch" || intent.mealType === "dinner") {
            deps.savePendingReminder(intent.mealType);
            await deps.prepareNavigation();
            await deps.navigate(mealRecordsRoute);
          }
        },
      });
    },
    sync,
    unregister: async () => {
      if (!currentToken) return false;
      try {
        await deps.unregisterToken(currentToken);
        currentToken = null;
        return true;
      } catch {
        return false;
      }
    },
  };
}

const defaultCoordinator = createAndroidPushCoordinator(androidPushNotificationAdapter);
export const initializeAndroidPushNotifications = () => defaultCoordinator.initialize();
export const syncAndroidPushToken = () => defaultCoordinator.sync();
export const unregisterAndroidPushToken = () => defaultCoordinator.unregister();
