import type { MacroNutrients, MealFixture } from "../types/nutrition";

export const fixtureMacros: MacroNutrients = { protein: 145, carbs: 220, fat: 58 };
export const fixtureTargets: MacroNutrients = { protein: 180, carbs: 300, fat: 70 };

export const fixtureMeals: MealFixture[] = [
  { id: "fixture-breakfast", title: "燕麦与莓果", mealType: "早餐", calories: 320, protein: 12 },
  { id: "fixture-lunch", title: "香煎鸡胸沙拉", mealType: "午餐", calories: 450, protein: 45 },
];
