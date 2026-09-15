import { describe, expect, it } from "vitest";
import {
  DEFAULT_SMART_REMINDER_SETTINGS,
  type SmartReminderSettings,
} from "./domain";
import { createSmartReminderStorage } from "./storage";

describe("smart reminder storage", () => {
  it("returns opt-in defaults for a new account", () => {
    const storage = createSmartReminderStorage({ read: () => null, write: () => undefined });
    expect(storage.load("account-a")).toEqual(DEFAULT_SMART_REMINDER_SETTINGS);
  });

  it("keeps account settings isolated and round-trippable", () => {
    let value: unknown = null;
    const storage = createSmartReminderStorage({ read: () => value, write: (_, next) => { value = next; } });
    const accountA = { ...DEFAULT_SMART_REMINDER_SETTINGS, enabled: true } satisfies SmartReminderSettings;
    const accountB = { ...DEFAULT_SMART_REMINDER_SETTINGS, meals: { ...DEFAULT_SMART_REMINDER_SETTINGS.meals, lunch: { enabled: false, time: "12:30" } } } satisfies SmartReminderSettings;

    storage.save("account-a", accountA);
    storage.save("account-b", accountB);

    expect(storage.load("account-a")).toEqual(accountA);
    expect(storage.load("account-b")).toEqual(accountB);
  });

  it("clears only the requested account", () => {
    let value: Record<string, SmartReminderSettings> = {};
    const storage = createSmartReminderStorage({ read: () => value, write: (_, next) => { value = next as Record<string, SmartReminderSettings>; } });
    storage.save("account-a", { ...DEFAULT_SMART_REMINDER_SETTINGS, enabled: true });
    storage.save("account-b", { ...DEFAULT_SMART_REMINDER_SETTINGS, enabled: true });

    storage.clear("account-a");

    expect(storage.load("account-a")).toEqual(DEFAULT_SMART_REMINDER_SETTINGS);
    expect(storage.load("account-b").enabled).toBe(true);
  });
});
