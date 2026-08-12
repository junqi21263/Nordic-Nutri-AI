import { describe, expect, it } from "vitest";
import { createMealSavedCelebrationStore } from "../src/stores/meal-saved-celebration-store";

describe("meal saved celebration store", () => {
  it("keeps the synchronized saved-meal payload until dismissed", () => {
    const store = createMealSavedCelebrationStore();
    store.getState().show({
      mealId: "meal-1",
      calories: 450,
      protein: 35,
      carbs: 12,
      fat: 28,
      previousCalories: 970,
      currentCalories: 1420,
      targetCalories: 2100,
    });

    expect(store.getState().savedMeal).toMatchObject({
      mealId: "meal-1",
      previousCalories: 970,
      currentCalories: 1420,
    });

    store.getState().dismiss();

    expect(store.getState().savedMeal).toBeNull();
  });
});
