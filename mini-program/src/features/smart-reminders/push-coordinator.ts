import { useAuthStore } from "../../auth/auth-store";
import {
  acknowledgeAndroidPushDelivery,
  registerAndroidPushToken,
  unregisterAndroidPushToken as unregisterAndroidPushTokenApi,
} from "../../api/push-api";
import {
  androidPushNotificationAdapter,
  type AndroidPushNotificationAdapter,
  type NativePushIntent,
} from "../../platform/android-push-notifications";
import { pendingReminderStorage } from "./pending-reminder";
import { getReminderMealType, mealRecordsRoute } from "./push-navigation";

let currentToken: string | null = null;
let initialized = false;

function defaultNavigate(url: string) {
  return import("@tarojs/taro").then(({ default: Taro }) =>
    url === mealRecordsRoute ? Taro.switchTab({ url }) : Taro.navigateTo({ url }),
  );
}

export function createAndroidPushCoordinator(
  adapter: AndroidPushNotificationAdapter,
  deps = {
    getSession: () => useAuthStore.getState().session,
    registerToken: registerAndroidPushToken,
    unregisterToken: unregisterAndroidPushTokenApi,
    acknowledgeDelivery: acknowledgeAndroidPushDelivery,
    savePendingReminder: pendingReminderStorage.save,
    prepareNavigation: () =>
      import("../../auth/app-auth-bootstrap").then(({ startApplicationAuth }) =>
        startApplicationAuth(),
      ),
    navigate: defaultNavigate,
  },
  getUserId = () => useAuthStore.getState().user?.id,
) {
  let pendingMessage: { id: string; owner: string } | null = null;
  const openPendingMessage = async () => {
    if (!pendingMessage || !deps.getSession()?.accessToken) return;
    const message = pendingMessage;
    pendingMessage = null;
    if (message.owner !== getUserId()) return;
    await deps.navigate(`/pages/notifications/index?id=${encodeURIComponent(message.id)}`);
  };
  const handleMessage = async (data: unknown) => {
    if (!data || typeof data !== "object") return false;
    const value = data as { notificationId?: unknown; userId?: unknown };
    if (
      typeof value.notificationId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(value.notificationId) ||
      typeof value.userId !== "string"
    )
      return false;
    pendingMessage = { id: value.notificationId, owner: value.userId };
    await deps.prepareNavigation();
    await openPendingMessage();
    return true;
  };
  const deliveryIdFrom = (value: unknown) => {
    const data = (value as { data?: unknown })?.data;
    const deliveryId =
      data &&
      typeof data === "object" &&
      typeof (data as { deliveryId?: unknown }).deliveryId === "string"
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
          if (await handleMessage(action.notification.data)) return;
          const mealType = getReminderMealType(action);
          if (mealType) {
            deps.savePendingReminder(mealType);
            await deps.prepareNavigation();
            await deps.navigate(mealRecordsRoute);
          }
        },
        onLaunchIntent: async (intent: NativePushIntent) => {
          await deps.acknowledgeDelivery(intent.deliveryId, "opened").catch(() => {});
          if (await handleMessage(intent)) return;
          if (
            intent.mealType === "breakfast" ||
            intent.mealType === "lunch" ||
            intent.mealType === "dinner"
          ) {
            deps.savePendingReminder(intent.mealType);
            await deps.prepareNavigation();
            await deps.navigate(mealRecordsRoute);
          }
        },
      });
    },
    sync,
    resume: openPendingMessage,
    unregister: async () => {
      pendingMessage = null;
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

export const resumePendingNotification = () => defaultCoordinator.resume();
