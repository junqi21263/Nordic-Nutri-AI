import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Meal } from "../src/features/meals/domain";
import { toProductMealInput } from "../src/features/meals/product-meal-input";
import { mapProductMeal } from "../src/features/meals/product-meal-mapper";
import { createPortionDraftStore } from "../src/stores/portion-draft-store";

const baseMeal: Meal = {
  id: "meal-1",
  date: "2026-08-11",
  time: "12:00",
  title: "测试午餐",
  mealType: "lunch",
  favorite: false,
  imageKey: "bowl",
  insight: "测试",
  items: [
    { id: "rice", name: "米饭", amount: "75g", aiQuantityG: 100, calories: 87, protein: 2, carbs: 19, fat: 0 },
  ],
};

describe("portion draft store", () => {
  it("restores the saved recognition portion when editing a meal", () => {
    const store = createPortionDraftStore();

    store.getState().startMealEdit(baseMeal);

    expect(store.getState().multiplier).toBe(0.75);
  });

  it("keeps the camera analysis portion when the same draft is opened again", () => {
    const store = createPortionDraftStore();
    const analysis = {
      id: "scan-1",
      title: "测试餐食",
      mealType: "lunch" as const,
      imageKey: "bowl" as const,
      confidence: 98,
      insight: "测试",
      items: [{ id: "rice", name: "米饭", amount: "1 份", calories: 100, protein: 2, carbs: 20, fat: 0 }],
    };

    store.getState().start(analysis);
    store.getState().setMultiplier(0.75);
    store.getState().start(analysis);

    expect(store.getState().multiplier).toBe(0.75);
  });

  it("uses the persisted portion multiplier before legacy item-ratio inference", () => {
    const store = createPortionDraftStore();
    const legacyDamagedMeal: Meal = {
      ...baseMeal,
      portionMultiplier: 0.75,
      items: [{ ...baseMeal.items[0], aiQuantityG: 75 }],
    };

    store.getState().startMealEdit(legacyDamagedMeal);

    expect(store.getState().multiplier).toBe(0.75);
  });

  it("falls back to 100 percent when the original recognition portion is unavailable", () => {
    const store = createPortionDraftStore();
    const manualMeal: Meal = {
      ...baseMeal,
      items: [{ ...baseMeal.items[0], aiQuantityG: null }],
    };

    store.getState().startMealEdit(manualMeal);

    expect(store.getState().multiplier).toBe(1);
  });

  it("keeps the original recognition quantity when a 75 percent adjustment is saved", () => {
    const input = toProductMealInput({
      ...baseMeal,
      items: [{ ...baseMeal.items[0], amount: "75g", calories: 87, protein: 2, carbs: 19, fat: 0 }],
    });

    expect(input.items[0]).toMatchObject({ quantityG: 75, aiQuantityG: 100 });
    expect(input.portionMultiplier).toBe(1);
  });

  it("restores 75 percent after a saved meal is mapped back from the API", () => {
    const input = toProductMealInput(baseMeal);
    const persistedMeal = mapProductMeal({
      id: baseMeal.id,
      mealType: baseMeal.mealType,
      name: baseMeal.title,
      recordedAt: "2026-08-11T04:00:00.000Z",
      isFavorite: false,
      items: input.items.map((item, index) => ({ id: `item-${index}`, ...item })),
    });
    const store = createPortionDraftStore();

    store.getState().startMealEdit(persistedMeal);

    expect(store.getState().multiplier).toBe(0.75);
  });

  it("explicitly carries the draft baseline into an edited meal update", () => {
    const page = readFileSync(resolve(import.meta.dirname, "../src/pages/portion-adjustment/index.tsx"), "utf8");

    expect(page).toContain("const originalQuantityByItemId");
    expect(page).toContain("aiQuantityG: originalQuantityByItemId.get(item.id) ?? item.aiQuantityG");
  });
});
