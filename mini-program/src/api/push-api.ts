import { requestProductApi } from "./product-api-client";
import type { SmartReminderSettings } from "../features/smart-reminders/domain";

export const ANDROID_PUSH_PACKAGE = "com.lewislee.nordicnutri.dev";

export function registerAndroidPushToken(token: string) {
  return requestProductApi<{ registered: boolean }>("/push-tokens", {
    method: "POST",
    data: { token, platform: "android", packageName: ANDROID_PUSH_PACKAGE },
    fallbackMessage: "推送服务连接失败，请稍后重试",
  });
}

export function unregisterAndroidPushToken(token: string) {
  return requestProductApi<{ removed: boolean }>("/push-tokens", {
    method: "DELETE",
    data: { token },
    fallbackMessage: "推送服务断开失败，请稍后重试",
  });
}

export type PushDeliveryEvent = "received" | "displayed" | "opened";

export function acknowledgeAndroidPushDelivery(deliveryId: string, event: PushDeliveryEvent) {
  return requestProductApi<{ acknowledged: boolean; deliveryId: string; event: PushDeliveryEvent; status: string }>("/push-delivery/ack", {
    method: "POST",
    data: { deliveryId, event },
    fallbackMessage: "推送回执上报失败",
  });
}

export function syncSmartReminderSchedule(settings: SmartReminderSettings) {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Shanghai";
  return requestProductApi<{ synced: boolean }>("/smart-reminders", {
    method: "PUT",
    data: { ...settings, timeZone },
    fallbackMessage: "提醒排程同步失败，请稍后重试",
  });
}
