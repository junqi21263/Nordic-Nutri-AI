import { describe, expect, it } from "vitest";
import {
  inferMealTypeFromTime,
  mealTypeLabels,
} from "../src/features/meals/meal-type";

describe("inferMealTypeFromTime", () => {
  it("maps local clock windows to breakfast, lunch, dinner, or snack", () => {
    expect(inferMealTypeFromTime(new Date(2026, 6, 31, 6, 0))).toBe("breakfast");
    expect(inferMealTypeFromTime(new Date(2026, 6, 31, 10, 59))).toBe("breakfast");
    expect(inferMealTypeFromTime(new Date(2026, 6, 31, 11, 0))).toBe("lunch");
    expect(inferMealTypeFromTime(new Date(2026, 6, 31, 14, 59))).toBe("lunch");
    expect(inferMealTypeFromTime(new Date(2026, 6, 31, 17, 0))).toBe("dinner");
    expect(inferMealTypeFromTime(new Date(2026, 6, 31, 20, 59))).toBe("dinner");
    expect(inferMealTypeFromTime(new Date(2026, 6, 31, 15, 0))).toBe("snack");
    expect(inferMealTypeFromTime(new Date(2026, 6, 31, 22, 30))).toBe("snack");
    expect(inferMealTypeFromTime(new Date(2026, 6, 31, 5, 59))).toBe("snack");
  });

  it("exposes Chinese labels for the four meal types", () => {
    expect(mealTypeLabels.breakfast).toBe("早餐");
    expect(mealTypeLabels.lunch).toBe("午餐");
    expect(mealTypeLabels.dinner).toBe("晚餐");
    expect(mealTypeLabels.snack).toBe("加餐");
  });
});
