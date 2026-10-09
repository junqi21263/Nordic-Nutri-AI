import { expect, it } from "vitest";
import { getRecentFrequentMeals } from "../src/features/meals/recent-frequent-meals";
import type { Meal } from "../src/features/meals/domain";
const meal = (id: string, title: string, date: string): Meal => ({ id, title, date, time: "08:00", mealType: "breakfast", favorite: false, imageKey: null, insight: "", items: [{ id, name: title, amount: "100g", calories: 100, protein: 10, carbs: 5, fat: 3 }] });
it("ranks repeated food combinations and uses the latest independent record, capped at three", () => {
  const result = getRecentFrequentMeals([meal("1", "鸡蛋", "2026-09-01"), meal("2", "鸡蛋", "2026-09-10"), meal("3", "面条", "2026-09-11")]);
  expect(result).toHaveLength(1);
  expect(result[0].meal.id).toBe("2");
  expect(result[0].count).toBe(2);
  expect(getRecentFrequentMeals(Array.from({ length: 10 }, (_, i) => meal(String(i), String(i % 5), "2026-09-10")))).toHaveLength(3);
});
