import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Meal } from "../src/features/meals/domain";
import { createMealFromAnalysis } from "../src/features/scanner/domain";
import { toProductMealInput } from "../src/features/meals/product-meal-input";
import { createPortionDraftStore } from "../src/stores/portion-draft-store";

const sourceMeal: Meal = {
  id: "22222222-2222-4222-8222-222222222222",
  date: "2026-09-11",
  time: "12:30",
  title: "鸡胸肉饭碗",
  mealType: "lunch",
  favorite: true,
  portionMultiplier: 0.75,
  imageKey: "bowl",
  imageUrl: "cloud://meal-image",
  insight: "原餐分析建议",
  items: [
    {
      id: "item-1",
      name: "鸡胸肉",
      amount: "75g",
      aiQuantityG: 100,
      calories: 120,
      protein: 23,
      carbs: 0,
      fat: 3,
    },
  ],
};

describe("repeat meal", () => {
  it("starts a new meal draft with the saved portion and source image context", () => {
    const store = createPortionDraftStore();

    store.getState().startMealRepeat(sourceMeal);

    expect(store.getState().editingMealId).toBeNull();
    expect(store.getState().isRepeating).toBe(true);
    expect(store.getState().multiplier).toBe(1);
    expect(store.getState().getAdjusted()?.calories).toBe(120);
    expect(store.getState().meal?.items[0].amount).toBe("75g");
    expect(store.getState().meal?.insight).toBe("");
    expect(store.getState().meal).toMatchObject({ imageUrl: "cloud://meal-image" });
    expect(store.getState().meal?.analysisId).toBeUndefined();

    const repeatedMeal = createMealFromAnalysis(store.getState().meal!, store.getState().multiplier, "2026-09-12", "18:30");
    expect(toProductMealInput(repeatedMeal)).toMatchObject({ isFavorite: false, imagePath: "cloud://meal-image" });
    expect(toProductMealInput(repeatedMeal)).not.toHaveProperty("analysisId");
  });

  it("exposes repeat action and confirms the new record time before saving", () => {
    const page = readFileSync(resolve(import.meta.dirname, "../src/pages/meal-detail/index.tsx"), "utf8");
    const adjustment = readFileSync(resolve(import.meta.dirname, "../src/pages/portion-adjustment/index.tsx"), "utf8");

    expect(page).toContain('ariaLabel="再吃一次"');
    expect(page).toContain("startMealRepeat(meal)");
    expect(adjustment).toContain("RecordTimeEditor");
    expect(adjustment).toContain("isRepeating");
  });
});
