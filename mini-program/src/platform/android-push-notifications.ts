import { Capacitor } from "@capacitor/core";
import { PushNotifications, type ActionPerformed, type PermissionStatus, type PushNotificationSchema, type Token } from "@capacitor/push-notifications";

type ListenerHandle = { remove: () => Promise<void> };
export type NativePushIntent = { deliveryId: string; mealType: string; traceId?: string };
type PushAdapterDependencies = {
  isAvailable: () => boolean;
  checkPermissions: () => Promise<PermissionStatus>;
  requestPermissions: () => Promise<PermissionStatus>;
  createChannel?: (options: {
    id: string;
    name: string;
    description: string;
    importance: 4;
    visibility: 1;
    sound: string;
    vibration: true;
  }) => Promise<void>;
  register: () => Promise<void>;
  consumeLaunchIntent?: () => NativePushIntent | null;
  addLaunchIntentListener?: (listener: (intent: NativePushIntent) => void | Promise<void>) => void;
  addListener: {
    (event: "registration", listener: (value: Token) => void): Promise<ListenerHandle>;
    (event: "pushNotificationReceived", listener: (value: PushNotificationSchema) => void): Promise<ListenerHandle>;
    (event: "pushNotificationActionPerformed", listener: (value: ActionPerformed) => void): Promise<ListenerHandle>;
  };
};

export interface AndroidPushNotificationAdapter {
  isAvailable: () => boolean;
  initialize: (listeners: { onToken: (token: string) => void | Promise<void>; onNotification: (notification: PushNotificationSchema) => void | Promise<void>; onAction: (action: ActionPerformed) => void | Promise<void>; onLaunchIntent?: (intent: NativePushIntent) => void | Promise<void> }) => Promise<boolean>;
}

function consumeNativePushIntent(): NativePushIntent | null {
  try {
    const raw = window.NordicPushIntent?.consume?.();
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<NativePushIntent>;
    if (typeof value.deliveryId !== "string" || typeof value.mealType !== "string") return null;
    return { deliveryId: value.deliveryId, mealType: value.mealType, traceId: value.traceId };
  } catch {
    return null;
  }
}

export function createAndroidPushNotificationAdapter(dependencies: PushAdapterDependencies): AndroidPushNotificationAdapter {
  let initialized = false;
  return {
    isAvailable: dependencies.isAvailable,
    initialize: async ({ onToken, onNotification, onAction, onLaunchIntent }) => {
      if (!dependencies.isAvailable()) return false;
      if (initialized) return true;
      initialized = true;
      await dependencies.addListener("registration", (value) => {
        const token = (value as Token)?.value;
        if (typeof token === "string" && token.trim()) void onToken(token.trim());
      });
      await dependencies.addListener("pushNotificationReceived", (value) => {
        void onNotification(value as PushNotificationSchema);
      });
      await dependencies.addListener("pushNotificationActionPerformed", (value) => {
        void onAction(value as ActionPerformed);
      });
      dependencies.addLaunchIntentListener?.((intent) => onLaunchIntent?.(intent));
      const current = await dependencies.checkPermissions();
      const permission = current.receive === "granted" ? current : await dependencies.requestPermissions();
      if (permission.receive !== "granted") return false;
      await dependencies.createChannel?.({
        id: "meal-reminders",
        name: "餐次记录提醒",
        description: "轻轻提醒尚未记录的餐次",
        importance: 4,
        visibility: 1,
        sound: "default",
        vibration: true,
      });
      await dependencies.register();
      const launchIntent = dependencies.consumeLaunchIntent?.();
      if (launchIntent) await onLaunchIntent?.(launchIntent);
      return true;
    },
  };
}

export const androidPushNotificationAdapter = createAndroidPushNotificationAdapter({
  isAvailable: () => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android",
  checkPermissions: () => PushNotifications.checkPermissions(),
  requestPermissions: () => PushNotifications.requestPermissions(),
  createChannel: (options) => PushNotifications.createChannel(options),
  register: () => PushNotifications.register(),
  consumeLaunchIntent: consumeNativePushIntent,
  addLaunchIntentListener: (listener) => {
    window.addEventListener("nordicpushintent", () => {
      const intent = consumeNativePushIntent();
      if (intent) void listener(intent);
    });
  },
  addListener: ((eventName: "registration" | "pushNotificationReceived" | "pushNotificationActionPerformed", listener: (value: Token | PushNotificationSchema | ActionPerformed) => void) =>
    PushNotifications.addListener(eventName as never, listener as never)) as PushAdapterDependencies["addListener"],
});
