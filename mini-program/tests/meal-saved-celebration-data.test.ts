import { describe, expect, it } from "vitest";
import { toMealSavedCelebration } from "../src/features/meals/meal-saved-celebration-data";
import type { Meal } from "../src/features/meals/domain";

function meal(id: string, calories: number, protein = 0, carbs = 0, fat = 0): Meal {
  return {
    id,
    date: "2026-08-11",
    time: "12:00",
    title: id,
    mealType: "lunch",
    favorite: false,
    imageKey: null,
    insight: "",
    items: [{ id: `${id}-item`, name: id, amount: "1 份", calories, protein, carbs, fat }],
  };
}

describe("meal saved celebration data", () => {
  it("uses persisted meal nutrition and synchronized daily totals", () => {
    expect(
      toMealSavedCelebration({
        savedMeal: meal("meal-1", 450, 35, 12, 28),
        previousCalories: 970,
        syncedMeals: [meal("meal-old", 970), meal("meal-1", 450, 35, 12, 28)],
        targetCalories: 2100,
      }),
    ).toEqual({
      kind: "created",
      mealId: "meal-1",
      calories: 450,
      protein: 35,
      carbs: 12,
      fat: 28,
      previousCalories: 970,
      currentCalories: 1420,
      targetCalories: 2100,
    });
  });
});
