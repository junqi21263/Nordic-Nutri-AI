import { describe, expect, it } from "vitest";
import type { Meal } from "../meals/domain";
import {
  DEFAULT_SMART_REMINDER_SETTINGS,
  REMINDER_WINDOWS,
  buildTodayReminderCandidates,
  getReminderCopy,
  getReminderNotificationId,
  isReminderTimeInWindow,
} from "./domain";

const meal = (date: string, mealType: Meal["mealType"]): Meal => ({
  id: `${date}-${mealType}`,
  date,
  time: "12:00",
  title: `${mealType} meal`,
  mealType,
  favorite: false,
  imageKey: null,
  insight: "",
  items: [],
});

describe("smart reminder domain", () => {
  it("starts opt-in with all three meal rows available", () => {
    expect(DEFAULT_SMART_REMINDER_SETTINGS).toEqual({
      enabled: false,
      meals: {
        breakfast: { enabled: true, time: "08:30" },
        lunch: { enabled: true, time: "12:30" },
        dinner: { enabled: true, time: "19:00" },
      },
    });
  });

  it("accepts only times inside the inclusive meal window", () => {
    expect(isReminderTimeInWindow("breakfast", REMINDER_WINDOWS.breakfast.start)).toBe(true);
    expect(isReminderTimeInWindow("breakfast", REMINDER_WINDOWS.breakfast.end)).toBe(true);
    expect(isReminderTimeInWindow("breakfast", "06:59")).toBe(false);
    expect(isReminderTimeInWindow("breakfast", "10:01")).toBe(false);
    expect(isReminderTimeInWindow("lunch", "invalid")).toBe(false);
  });

  it("uses stable ids and skips disabled, recorded, snack, and past reminders", () => {
    const settings = {
      ...DEFAULT_SMART_REMINDER_SETTINGS,
      enabled: true,
      meals: {
        ...DEFAULT_SMART_REMINDER_SETTINGS.meals,
        breakfast: { enabled: true, time: "07:30" },
        lunch: { enabled: false, time: "12:30" },
        dinner: { enabled: true, time: "19:00" },
      },
    } as const;
    const today = "2026-09-11";
    const candidates = buildTodayReminderCandidates(
      settings,
      [meal(today, "breakfast"), meal(today, "snack")],
      new Date("2026-09-11T08:00:00+08:00"),
    );

    expect(getReminderNotificationId("breakfast")).toBe(getReminderNotificationId("breakfast"));
    expect(candidates.map((candidate) => candidate.mealType)).toEqual(["dinner"]);
    expect(candidates[0]?.id).toBe(getReminderNotificationId("dinner"));
  });

  it("does not schedule a same-day catch-up after the selected time passed", () => {
    const candidates = buildTodayReminderCandidates(
      { ...DEFAULT_SMART_REMINDER_SETTINGS, enabled: true },
      [],
      new Date("2026-09-11T11:00:00+08:00"),
    );
    expect(candidates.map((candidate) => candidate.mealType)).toEqual(["lunch", "dinner"]);
  });

  it("prefers missed copy, then consistent copy, then ordinary copy", () => {
    expect(getReminderCopy("lunch", 2, 0).title).toBe("最近有点忙？");
    expect(getReminderCopy("lunch", 0, 3).title).toBe("今天也记一下这一餐 🌿");
    expect(getReminderCopy("lunch", 0, 0)).toEqual({
      title: "午餐还没记录吗？",
      body: "拍一下就好 📷",
    });
  });
});
