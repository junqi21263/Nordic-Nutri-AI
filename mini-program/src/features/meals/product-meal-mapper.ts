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
}

export interface ProductMeal {
  id: string;
  mealType: MealType;
  name: string;
  recordedAt: string;
  isFavorite: boolean;
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
    calories: round(item.caloriesPer100g * scale),
    protein: round(item.proteinPer100g * scale),
    carbs: round(item.carbsPer100g * scale),
    fat: round(item.fatPer100g * scale),
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
    imageKey: null,
    insight: "已同步到你的饮食记录。",
    items: meal.items.map(mapProductItem),
  };
}
