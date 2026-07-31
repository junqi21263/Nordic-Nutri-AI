import assert from "node:assert/strict";
import test from "node:test";

import { formulaNutritionPlanFallback } from "./nutrition-plan-formula.cjs";

const baseInput = {
  age: 28,
  sex: "female",
  heightCm: 165,
  weightKg: 58,
  activityLevel: "moderate",
  trainingDays: 4,
  goalType: "maintenance",
  dietaryPattern: "none",
  foodAvoidances: [],
  mealsPerDay: 3,
};

test("formula fallback lowers carbs for low_carb vs balanced", () => {
  const balanced = formulaNutritionPlanFallback(baseInput);
  const lowCarb = formulaNutritionPlanFallback({ ...baseInput, dietaryPattern: "low_carb" });
  assert.equal(balanced.calories, lowCarb.calories);
  assert.ok(lowCarb.carbsG < balanced.carbsG);
  assert.ok(lowCarb.fatG > balanced.fatG);
  assert.match(lowCarb.insight, /低碳/);
});

test("formula fallback insight includes avoidances and meals", () => {
  const plan = formulaNutritionPlanFallback({
    ...baseInput,
    dietaryPattern: "vegetarian",
    foodAvoidances: ["spicy", "dairy"],
    mealsPerDay: 4,
  });
  assert.match(plan.insight, /素食/);
  assert.match(plan.insight, /辛辣|乳制品/);
  assert.match(plan.insight, /4 餐/);
});
