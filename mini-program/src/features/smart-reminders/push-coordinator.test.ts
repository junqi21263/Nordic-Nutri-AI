import { describe, expect, it, vi } from "vitest";
import type { AndroidPushNotificationAdapter, NativePushIntent } from "../../platform/android-push-notifications";

vi.mock("../../api/push-api", () => ({
  acknowledgeAndroidPushDelivery: vi.fn(),
  registerAndroidPushToken: vi.fn(),
  unregisterAndroidPushToken: vi.fn(),
}));
vi.mock("../../auth/auth-store", () => ({ useAuthStore: { getState: () => ({ session: null }) } }));
vi.mock("../../platform/android-push-notifications", () => ({
  androidPushNotificationAdapter: { isAvailable: () => false, initialize: vi.fn() },
}));

import { createAndroidPushCoordinator } from "./push-coordinator";

describe("Android push coordinator", () => {
  it("waits for application startup before navigating a cold-start notification", async () => {
    let onLaunchIntent: ((intent: NativePushIntent) => void | Promise<void>) | undefined;
    let releaseStartup: (() => void) | undefined;
    const startupReady = new Promise<void>((resolve) => { releaseStartup = resolve; });
    const navigate = vi.fn();
    const adapter: AndroidPushNotificationAdapter = {
      isAvailable: () => true,
      initialize: vi.fn(async (listeners) => {
        onLaunchIntent = listeners.onLaunchIntent;
        return true;
      }),
    };
    const coordinator = createAndroidPushCoordinator(adapter, {
      getSession: () => ({ accessToken: "session" }) as never,
      registerToken: vi.fn(async () => ({ registered: true })),
      unregisterToken: vi.fn(async () => ({ removed: true })),
      acknowledgeDelivery: vi.fn(async (deliveryId, event) => ({ acknowledged: true, deliveryId, event, status: event })),
      savePendingReminder: vi.fn(),
      prepareNavigation: () => startupReady,
      navigate,
    });

    await coordinator.initialize();
    const handling = onLaunchIntent?.({ deliveryId: "delivery-1", mealType: "breakfast" });

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(navigate).not.toHaveBeenCalled();

    releaseStartup?.();
    await handling;
    expect(navigate).toHaveBeenCalledWith("/pages/meal-records/index");
  });
});
