import { describe, expect, it } from "vitest";
import type { ActionPerformed } from "@capacitor/push-notifications";
import { getReminderMealType, mealRecordsRoute } from "./push-navigation";

describe("push reminder navigation", () => {
  it("recognizes a valid reminder meal and targets the records tab", () => {
    expect(getReminderMealType({ notification: { data: { mealType: "dinner", reminder: "1" } } } as ActionPerformed)).toBe("dinner");
    expect(mealRecordsRoute).toBe("/pages/meal-records/index");
  });

  it("ignores non-reminder notifications", () => {
    expect(getReminderMealType({ notification: { data: { mealType: "dinner" } } } as ActionPerformed)).toBeNull();
  });
});
