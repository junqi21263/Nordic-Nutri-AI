import { describe, expect, it, vi } from "vitest";
import { createAndroidPushNotificationAdapter } from "./android-push-notifications";

describe("Android push notification adapter", () => {
  it("registers only on native Android and forwards the FCM token", async () => {
    const register = vi.fn(async () => undefined);
    const createChannel = vi.fn(async () => undefined);
    const addListener = vi.fn(async () => ({ remove: vi.fn(async () => undefined) }));
    const adapter = createAndroidPushNotificationAdapter({
      isAvailable: () => true,
      checkPermissions: vi.fn(async () => ({ receive: "granted" as const })),
      requestPermissions: vi.fn(async () => ({ receive: "granted" as const })),
      register,
      createChannel,
      addListener,
    });

    await adapter.initialize({ onToken: vi.fn(async () => undefined), onNotification: vi.fn(), onAction: vi.fn() });

    expect(register).toHaveBeenCalledOnce();
    expect(createChannel).toHaveBeenCalledWith({
      id: "meal-reminders",
      name: "餐次记录提醒",
      description: "轻轻提醒尚未记录的餐次",
      importance: 4,
      visibility: 1,
      sound: "default",
      vibration: true,
    });
    expect(addListener).toHaveBeenCalledWith("registration", expect.any(Function));
    expect(addListener).toHaveBeenCalledWith("pushNotificationReceived", expect.any(Function));
  });

  it("does not request permission or register on unsupported platforms", async () => {
    const requestPermissions = vi.fn();
    const register = vi.fn();
    const adapter = createAndroidPushNotificationAdapter({
      isAvailable: () => false,
      checkPermissions: vi.fn(),
      requestPermissions,
      register,
      addListener: vi.fn(),
    });

    await adapter.initialize({ onToken: vi.fn(async () => undefined), onNotification: vi.fn(), onAction: vi.fn() });

    expect(requestPermissions).not.toHaveBeenCalled();
    expect(register).not.toHaveBeenCalled();
  });
});
