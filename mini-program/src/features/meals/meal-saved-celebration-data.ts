import { getDailySummary, getMealNutrition, type Meal } from "./domain";
import type { SavedMealCelebration } from "../../stores/meal-saved-celebration-store";

export function toMealSavedCelebration({
  savedMeal,
  previousCalories,
  syncedMeals,
  targetCalories,
  kind = "created",
  afterContinue,
}: {
  savedMeal: Meal;
  previousCalories: number;
  syncedMeals: Meal[];
  targetCalories: number;
  kind?: "created" | "updated";
  afterContinue?: () => Promise<boolean>;
}): SavedMealCelebration {
  const nutrition = getMealNutrition(savedMeal);
  const currentCalories = getDailySummary(syncedMeals, savedMeal.date, {
    calories: targetCalories,
    protein: 0,
    carbs: 0,
    fat: 0,
  }).consumed.calories;

  return {
    kind,
    mealId: savedMeal.id,
    ...nutrition,
    previousCalories,
    currentCalories,
    targetCalories,
    afterContinue,
  };
}
