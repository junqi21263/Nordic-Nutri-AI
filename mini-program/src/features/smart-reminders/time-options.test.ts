import { describe, expect, it } from "vitest";
import {
  clampReminderTime,
  getReminderTimeOptions,
  reminderWheelIndexFromScrollTop,
  reminderWheelScrollTop,
} from "./time-options";

describe("reminder time options", () => {
  it("builds app-owned hour and five-minute options", () => {
    expect(getReminderTimeOptions("breakfast").hours).toEqual([7, 8, 9, 10]);
    expect(getReminderTimeOptions("lunch").minutes).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  });

  it("clamps a custom selection to the meal window", () => {
    expect(clampReminderTime("breakfast", "06:58")).toBe("07:00");
    expect(clampReminderTime("breakfast", "09:37")).toBe("09:35");
    expect(clampReminderTime("breakfast", "10:58")).toBe("10:00");
  });

  it("maps wheel scrolling to a bounded centered option", () => {
    expect(reminderWheelIndexFromScrollTop(0, 4)).toBe(0);
    expect(reminderWheelIndexFromScrollTop(83, 4)).toBe(1);
    expect(reminderWheelIndexFromScrollTop(999, 4)).toBe(3);
    expect(reminderWheelScrollTop(2, 4)).toBe(112);
    expect(reminderWheelScrollTop(99, 4)).toBe(168);
  });
});
