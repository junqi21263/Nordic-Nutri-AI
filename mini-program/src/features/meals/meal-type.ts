import type { MealType } from "./domain";

export const mealTypeLabels: Record<MealType, string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  snack: "加餐",
};

export const mealTypeOptions: Array<{ value: MealType; label: string }> = [
  { value: "breakfast", label: mealTypeLabels.breakfast },
  { value: "lunch", label: mealTypeLabels.lunch },
  { value: "dinner", label: mealTypeLabels.dinner },
  { value: "snack", label: mealTypeLabels.snack },
];

/**
 * Infer meal type from the device's local clock.
 * Windows: breakfast 06:00–10:59, lunch 11:00–14:59, dinner 17:00–20:59, else snack.
 */
export function inferMealTypeFromTime(date: Date = new Date()): MealType {
  const hour = date.getHours();
  if (hour >= 6 && hour < 11) return "breakfast";
  if (hour >= 11 && hour < 15) return "lunch";
  if (hour >= 17 && hour < 21) return "dinner";
  return "snack";
}
