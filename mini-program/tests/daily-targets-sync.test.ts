import { describe, expect, it } from "vitest";
import { createMealStore, normalizeDailyTargets } from "../src/stores/meal-store";
import { localDailyTargets } from "../src/features/meals/domain";

describe("shared daily nutrition targets", () => {
  it("normalizes valid targets and rejects incomplete ones", () => {
    expect(normalizeDailyTargets({ calories: 2530, protein: 155, carbs: 290, fat: 85 })).toEqual({
      calories: 2530,
      protein: 155,
      carbs: 290,
      fat: 85,
    });
    expect(normalizeDailyTargets({ calories: 0, protein: 155, carbs: 290, fat: 85 })).toBeNull();
    expect(normalizeDailyTargets(null)).toBeNull();
  });

  it("applies setDailyTargets to getDailySummary used by coach/home", () => {
    const store = createMealStore([], "2026-08-06");
    expect(store.getState().getDailySummary("2026-08-06").calories).toBe(localDailyTargets.calories);

    store.getState().setDailyTargets({ calories: 2530, protein: 155, carbs: 290, fat: 85 });
    const summary = store.getState().getDailySummary("2026-08-06");
    expect(summary.calories).toBe(2530);
    expect(summary.protein).toBe(155);
    expect(summary.carbs).toBe(290);
    expect(summary.fat).toBe(85);
  });
});
