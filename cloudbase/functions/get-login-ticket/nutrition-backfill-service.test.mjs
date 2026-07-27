import assert from "node:assert/strict";
import test from "node:test";

import { createNutritionBackfillService, isPlausibleNutritionMatch, simplifyFoodQuery } from "./nutrition-backfill-service.cjs";

test("simplifyFoodQuery strips parentheticals and keeps the core name", () => {
  assert.equal(simplifyFoodQuery("白米饭 (含葱油/炸蒜)"), "白米饭");
  assert.equal(simplifyFoodQuery("白切鸡（带皮）"), "白切鸡");
  assert.equal(simplifyFoodQuery("鸡汤 [清汤]"), "鸡汤");
});

test("rejects USDA match that zeros out AI carb estimates for starchy foods", () => {
  const item = { name: "白米饭", quantityG: 180, caloriesPer100g: 130, proteinPer100g: 2.5, carbsPer100g: 28, fatPer100g: 0.3 };
  const chickenMatch = { caloriesKcalPer100g: 165, proteinGPer100g: 31, carbsGPer100g: 0, fatGPer100g: 3.6 };
  assert.equal(isPlausibleNutritionMatch(item, chickenMatch), false);
});

test("accepts USDA rice match that preserves carbs", () => {
  const item = { name: "白米饭", quantityG: 180, caloriesPer100g: 140, proteinPer100g: 3, carbsPer100g: 30, fatPer100g: 0.5 };
  const riceMatch = { caloriesKcalPer100g: 130, proteinGPer100g: 2.4, carbsGPer100g: 28.2, fatGPer100g: 0.3 };
  assert.equal(isPlausibleNutritionMatch(item, riceMatch), true);
});

test("rejects dense meat match for low-protein soup estimates", () => {
  const item = { name: "鸡汤", quantityG: 150, caloriesPer100g: 25, proteinPer100g: 3, carbsPer100g: 1, fatPer100g: 1 };
  const chickenMatch = { caloriesKcalPer100g: 165, proteinGPer100g: 31, carbsGPer100g: 0, fatGPer100g: 3.6 };
  assert.equal(isPlausibleNutritionMatch(item, chickenMatch), false);
});

test("rejects starchy USDA match for high-protein chicken estimates", () => {
  const item = { name: "白切鸡", quantityG: 120, caloriesPer100g: 180, proteinPer100g: 25, carbsPer100g: 0, fatPer100g: 8 };
  const riceMatch = { caloriesKcalPer100g: 130, proteinGPer100g: 2.4, carbsGPer100g: 28.2, fatGPer100g: 0.3 };
  assert.equal(isPlausibleNutritionMatch(item, riceMatch), false);
});

test("backfill keeps AI carbs when USDA match is implausible", async () => {
  const backfill = createNutritionBackfillService({
    foodCatalog: {
      lookupNutrition: async () => ({
        caloriesKcalPer100g: 165,
        proteinGPer100g: 31,
        carbsGPer100g: 0,
        fatGPer100g: 3.6,
      }),
    },
  });
  const [item] = await backfill([
    { name: "白米饭 (含葱油/炸蒜)", quantityG: 180, caloriesPer100g: 130, proteinPer100g: 2.5, carbsPer100g: 28, fatPer100g: 0.3 },
  ]);
  assert.equal(item.nutritionSource, "ai_estimate");
  assert.equal(item.carbsPer100g, 28);
});

test("backfill applies USDA values for a plausible rice match", async () => {
  const lookups = [];
  const backfill = createNutritionBackfillService({
    foodCatalog: {
      lookupNutrition: async (query) => {
        lookups.push(query);
        return { caloriesKcalPer100g: 130, proteinGPer100g: 2.4, carbsGPer100g: 28.2, fatGPer100g: 0.3 };
      },
    },
  });
  const [item] = await backfill([
    { name: "白米饭 (含葱油/炸蒜)", quantityG: 180, caloriesPer100g: 140, proteinPer100g: 3, carbsPer100g: 30, fatPer100g: 0.5 },
  ]);
  assert.equal(lookups[0], "白米饭");
  assert.equal(item.nutritionSource, "usda");
  assert.equal(item.carbsPer100g, 28.2);
});
