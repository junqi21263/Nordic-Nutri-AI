import { requestProductApi } from "./product-api-client";
export interface NotificationItem {
  id: string;
  kind: "system" | "feedback";
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
  feedback?: { content: string; admin_reply: string; replied_at: string };
}
export interface NotificationPreferences {
  systemPush: boolean;
  feedbackPush: boolean;
}
const options = { fallbackMessage: "消息加载失败，请稍后重试" };
export const getNotifications = (offset = 0, kind = "") =>
  requestProductApi<{ items: NotificationItem[]; total: number; unreadCount: number }>(
    `/notifications?offset=${offset}${kind ? `&kind=${kind}` : ""}`,
    { ...options, method: "GET" },
  );
export const getNotification = (id: string) =>
  requestProductApi<NotificationItem>(`/notifications/${encodeURIComponent(id)}`, {
    ...options,
    method: "GET",
  });
export const readNotification = (id: string) =>
  requestProductApi(`/notifications/${encodeURIComponent(id)}/read`, {
    ...options,
    method: "POST",
  });
export const getNotificationPreferences = () =>
  requestProductApi<NotificationPreferences>("/notification-preferences", {
    ...options,
    method: "GET",
  });
export const saveNotificationPreferences = (data: NotificationPreferences) =>
  requestProductApi<NotificationPreferences>("/notification-preferences", {
    ...options,
    method: "PUT",
    data: { ...data },
  });
