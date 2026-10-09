import type { ActionPerformed } from "@capacitor/push-notifications";
import type { MealReminderType } from "./domain";

export const mealRecordsRoute = "/pages/meal-records/index";

export function getReminderMealType(action: ActionPerformed): MealReminderType | null {
  const extra = action.notification.data as { mealType?: string; reminder?: string | boolean } | undefined;
  if (!extra?.reminder || !["breakfast", "lunch", "dinner"].includes(extra.mealType ?? "")) return null;
  return extra.mealType as MealReminderType;
}
