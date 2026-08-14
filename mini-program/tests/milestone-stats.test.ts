import { describe, expect, it } from "vitest";
import {
  calculateMilestoneStats,
  selectMilestoneHighlights,
} from "../src/features/milestones/stats";
import type { Meal } from "../src/features/meals/domain";
import { getMilestoneIllustration, MILESTONE_CONFIG } from "../src/features/milestones/config";

const meal = (overrides: Partial<Meal>): Meal => ({
  id: "meal-1",
  date: "2026-08-12",
  time: "12:00",
  title: "午餐",
  mealType: "lunch",
  favorite: false,
  imageKey: null,
  insight: "",
  items: [],
  ...overrides,
});

describe("milestone statistics", () => {
  it("keeps all four milestones in a single config", () => {
    expect(Object.keys(MILESTONE_CONFIG).map(Number)).toEqual([3, 7, 14, 30]);
    expect(Object.values(MILESTONE_CONFIG).map((item) => item.illustrations.length)).toEqual([3, 3, 2, 2]);
    expect(getMilestoneIllustration(7, 4)).toBe(getMilestoneIllustration(7, 1));
  });

  it("averages nutrients over recorded days instead of milestone days", () => {
    const stats = calculateMilestoneStats({
      milestone: 14,
      meals: [
        meal({ date: "2026-08-11", items: [{ id: "a", name: "鸡胸肉", amount: "100g", calories: 100, protein: 40, carbs: 10, fat: 5, foodId: "chicken" }] }),
        meal({ id: "meal-2", date: "2026-08-12", items: [{ id: "b", name: "鸡胸肉", amount: "150g", calories: 140, protein: 20, carbs: 20, fat: 15, foodId: "chicken" }] }),
      ],
      dailyTargets: { calories: 2000, protein: 100, carbs: 200, fat: 60 },
    });

    expect(stats.recordedDays).toBe(2);
    expect(stats.avgProtein).toBe(30);
    expect(stats.avgCarbs).toBe(15);
    expect(stats.avgFat).toBe(10);
  });

  it("aggregates the most logged food by food id before display name", () => {
    const stats = calculateMilestoneStats({
      milestone: 7,
      meals: [
        meal({ items: [{ id: "a", name: "米饭 100g", amount: "100g", calories: 100, protein: 2, carbs: 20, fat: 1, foodId: "rice" }] }),
        meal({ id: "meal-2", items: [{ id: "b", name: "米饭 150g", amount: "150g", calories: 150, protein: 3, carbs: 30, fat: 1, foodId: "rice" }] }),
      ],
      dailyTargets: { calories: 2000, protein: 100, carbs: 200, fat: 60 },
    });

    expect(stats.mostLoggedFood).toBe("米饭");
    expect(stats.mostLoggedFoodCount).toBe(2);
  });

  it("selects only meaningful available highlights for each milestone", () => {
    const highlights = selectMilestoneHighlights({
      milestone: 14,
      mealsLogged: 12,
      recordingConsistency: 86,
      avgProtein: 42,
      avgCarbs: 210,
      avgFat: 62,
    });

    expect(highlights).toEqual([
      expect.objectContaining({ key: "avgProtein", value: "42g" }),
      expect.objectContaining({ key: "avgCarbs", value: "210g" }),
      expect.objectContaining({ key: "avgFat", value: "62g" }),
    ]);
  });

  it("falls back without showing empty values when preferred metrics are unavailable", () => {
    const highlights = selectMilestoneHighlights({
      milestone: 30,
      mealsLogged: 27,
      recordingConsistency: 90,
      mostLoggedFood: "鸡胸肉",
      mostLoggedFoodCount: 8,
    });

    expect(highlights).toHaveLength(3);
    expect(highlights.map((item) => item.value)).not.toContain("--");
    expect(highlights.map((item) => item.key)).toEqual(["mostLoggedFood", "recordingConsistency", "mealsLogged"]);
  });
});
