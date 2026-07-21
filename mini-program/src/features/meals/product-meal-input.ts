import { type ProductMealInput } from "../../api/meal-data-api";
import { type Meal } from "./domain";

function readQuantity(amount: string) {
  const match = amount.match(/(\d+(?:\.\d+)?)\s*g/i);
  return match ? Number(match[1]) : 100;
}

export function recordedAtFromLocal(date: string, time: string) {
  return new Date(`${date}T${time}:00+08:00`).toISOString();
}

export function toProductMealInput(
  meal: Omit<Meal, "id">,
  analysisId?: string | null,
): ProductMealInput {
  return {
    ...(analysisId ? { analysisId } : {}),
    mealType: meal.mealType,
    name: meal.title,
    recordedAt: recordedAtFromLocal(meal.date, meal.time),
    isFavorite: meal.favorite,
    items: meal.items.map((item) => {
      const quantityG = readQuantity(item.amount);
      const scale = quantityG / 100;
      return {
        name: item.name,
        quantityG,
        caloriesPer100g: item.calories / scale,
        proteinPer100g: item.protein / scale,
        carbsPer100g: item.carbs / scale,
        fatPer100g: item.fat / scale,
      };
    }),
  };
}
