import { describe, expect, it } from "vitest";
import { clampProgress, createMealFixtures, getDailySummary } from "../src/features/meals/domain";
import { createMealStore } from "../src/stores/meal-store";

const today = "2026-07-13";

describe("local meal store", () => {
  it("calculates Home nutrition totals from meal items", () => {
    const summary = getDailySummary(createMealFixtures(today), today);
    expect(summary.calories).toBeGreaterThan(0);
    expect(summary.protein).toBeGreaterThan(0);
  });

  it("clamps visual progress while preserving real overage", () => {
    expect(clampProgress(140, 100)).toEqual({ percent: 100, remaining: -40, exceeded: true });
    expect(clampProgress(0, 0)).toEqual({ percent: 0, remaining: 0, exceeded: false });
  });

  it("synchronizes deletion and edits into daily summaries", () => {
    const store = createMealStore(createMealFixtures(today), today);
    const meal = store.getState().getMealsByDate(today)[0]!;
    const before = store.getState().getDailySummary(today).consumed.calories;
    store.getState().deleteMeal(meal.id);
    expect(store.getState().getDailySummary(today).consumed.calories).toBeLessThan(before);
    const remaining = store.getState().getMealsByDate(today)[0]!;
    store.getState().updateMeal(remaining.id, {
      items: [
        {
          id: "edited",
          name: "燕麦",
          amount: "80g",
          calories: 500,
          protein: 20,
          carbs: 70,
          fat: 10,
        },
      ],
    });
    expect(store.getState().getDailySummary(today).consumed.calories).toBeGreaterThan(0);
  });

  it("synchronizes favorite state, name search, ingredient search and meal-type filters", () => {
    const store = createMealStore(createMealFixtures(today), today);
    const meal = store
      .getState()
      .getMealsByDate(today)
      .find((entry) => entry.mealType === "lunch")!;
    const expectedFavorite = !meal.favorite;
    store.getState().toggleFavorite(meal.id);
    expect(store.getState().getMealById(meal.id)?.favorite).toBe(expectedFavorite);
    expect(
      store
        .getState()
        .searchMeals("鸡胸")
        .some((entry) => entry.id === meal.id),
    ).toBe(true);
    store.getState().setMealTypeFilter("lunch");
    expect(
      store
        .getState()
        .filterMeals()
        .every((entry) => entry.mealType === "lunch"),
    ).toBe(true);
  });

  it("supports date switching, blank dates and fixture reset", () => {
    const store = createMealStore(createMealFixtures(today), today);
    store.getState().setSelectedDate("2026-07-20");
    expect(store.getState().getMealsByDate()).toEqual([]);
    store.getState().deleteMeal(store.getState().meals[0]!.id);
    store.getState().resetFixtures();
    expect(store.getState().meals).toHaveLength(createMealFixtures(today).length);
  });
});
