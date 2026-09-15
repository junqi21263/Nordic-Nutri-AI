import { describe, expect, it, vi } from "vitest";
import type { ActionPerformed } from "@capacitor/local-notifications";
import type { Meal } from "../meals/domain";
import type { ReminderCandidate } from "./domain";
import { DEFAULT_SMART_REMINDER_SETTINGS, getReminderNotificationId } from "./domain";
import { createSmartReminderCoordinator } from "./coordinator";

const meal = (date: string, mealType: Meal["mealType"]): Meal => ({
  id: `${date}-${mealType}`,
  date,
  time: "12:00",
  title: mealType,
  mealType,
  favorite: false,
  imageKey: null,
  insight: "",
  items: [],
});

describe("smart reminder coordinator", () => {
  it("cancels old ids before scheduling the current account candidates", async () => {
    const calls: string[] = [];
    const settings = { ...DEFAULT_SMART_REMINDER_SETTINGS, enabled: true };
    const coordinator = createSmartReminderCoordinator({
      adapter: {
        isAvailable: () => true,
        requestPermission: vi.fn(async () => true),
        cancel: vi.fn(async (ids: number[]): Promise<void> => { calls.push(`cancel:${ids.join(",")}`); }),
        schedule: vi.fn(async (candidates: ReminderCandidate[]): Promise<void> => { calls.push(`schedule:${candidates.map((candidate) => candidate.mealType).join(",")}`); }),
        addActionListener: vi.fn(async () => ({ remove: async () => undefined })),
      },
      storage: { load: () => settings, save: () => undefined, clear: () => undefined },
      getUserId: () => "account-a",
      getMeals: () => [meal("2026-09-11", "breakfast")],
      now: () => new Date("2026-09-11T08:00:00+08:00"),
      navigate: vi.fn(),
    });

    await coordinator.refresh();

    expect(calls).toEqual([`cancel:${getReminderNotificationId("breakfast")},${getReminderNotificationId("lunch")},${getReminderNotificationId("dinner")}`, "schedule:lunch,dinner"]);
  });

  it("cancels all reminder ids when the account signs out", async () => {
    const cancel = vi.fn(async () => undefined);
    const coordinator = createSmartReminderCoordinator({
      adapter: {
        isAvailable: () => true,
        requestPermission: vi.fn(async () => true),
        cancel,
        schedule: vi.fn(async () => undefined),
        addActionListener: vi.fn(async () => ({ remove: async () => undefined })),
      },
      storage: { load: () => DEFAULT_SMART_REMINDER_SETTINGS, save: () => undefined, clear: () => undefined },
      getUserId: () => "account-a",
      getMeals: () => [],
      navigate: vi.fn(),
    });

    await coordinator.cancel();

    expect(cancel).toHaveBeenCalledWith([
      getReminderNotificationId("breakfast"),
      getReminderNotificationId("lunch"),
      getReminderNotificationId("dinner"),
    ]);
  });

  it("routes a notification tap to manual recording with its meal type", async () => {
    let onAction: ((action: ActionPerformed) => void) | undefined;
    const navigate = vi.fn();
    const coordinator = createSmartReminderCoordinator({
      adapter: {
        isAvailable: () => true,
        requestPermission: vi.fn(async () => true),
        cancel: vi.fn(async () => undefined),
        schedule: vi.fn(async () => undefined),
        addActionListener: vi.fn(async (listener) => { onAction = listener; return { remove: async () => undefined }; }),
      },
      storage: { load: () => DEFAULT_SMART_REMINDER_SETTINGS, save: () => undefined, clear: () => undefined },
      getUserId: () => null,
      getMeals: () => [],
      navigate,
    });

    await coordinator.initialize();
    onAction?.({ notification: { extra: { mealType: "lunch", reminder: true } } } as ActionPerformed);

    expect(navigate).toHaveBeenCalledWith("/pages/manual-meal/index?mealType=lunch&reminder=1");
  });
});
