import { type Meal, type MealItem, type MealType } from "./domain";

export interface ProductMealItem {
  id: string;
  name: string;
  quantityG: number;
  aiQuantityG?: number | null;
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  foodId?: string | null;
  imageUrl?: string | null;
}

export interface ProductMeal {
  id: string;
  mealType: MealType;
  name: string;
  recordedAt: string;
  isFavorite: boolean;
  portionMultiplier?: number | null;
  imageUrl?: string | null;
  insight?: string | null;
  items: ProductMealItem[];
}

const round = (value: number) => Math.round(value);

function toShanghaiDateTime(value: string) {
  const date = new Date(value);
  const local = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return {
    date: `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}`,
    time: `${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`,
  };
}

function mapProductItem(item: ProductMealItem): MealItem {
  const scale = item.quantityG / 100;
  return {
    id: item.id,
    name: item.name,
    amount: `${round(item.quantityG)}g`,
    savedNutrition: { quantityG: item.quantityG, caloriesPer100g: item.caloriesPer100g, proteinPer100g: item.proteinPer100g, carbsPer100g: item.carbsPer100g, fatPer100g: item.fatPer100g },
    calories: round(item.caloriesPer100g * scale),
    protein: round(item.proteinPer100g * scale),
    carbs: round(item.carbsPer100g * scale),
    fat: round(item.fatPer100g * scale),
    aiQuantityG: item.aiQuantityG ?? null,
    foodId: item.foodId ?? null,
    imageUrl: item.imageUrl ?? null,
  };
}

export function mapProductMeal(meal: ProductMeal): Meal {
  const { date, time } = toShanghaiDateTime(meal.recordedAt);
  return {
    id: meal.id,
    date,
    time,
    title: meal.name,
    mealType: meal.mealType,
    favorite: meal.isFavorite,
    portionMultiplier: meal.portionMultiplier ?? null,
    imageKey: null,
    imageUrl: meal.imageUrl ?? null,
    insight: typeof meal.insight === "string" && meal.insight.trim()
      ? meal.insight.trim()
      : "正在整理这餐的营养小结…",
    items: meal.items.map(mapProductItem),
  };
}
