import type { ProductFoodCatalogItem } from "../../api/food-catalog-api";
import type { MealItem, MealType } from "../meals/domain";
import type { ScannerMealFixture } from "../scanner/domain";

export type RecognitionFeedbackType =
  "wrong_food" | "missing_food" | "extra_food" | "portion_inaccurate" | "nutrition_data" | "other";

export interface RecognitionFeedbackReason {
  type: RecognitionFeedbackType;
  label: string;
  description: string;
}

export const recognitionFeedbackReasons: RecognitionFeedbackReason[] = [
  { type: "wrong_food", label: "食物识别错了", description: "替换成正确的食物" },
  { type: "missing_food", label: "少识别了食物", description: "把漏掉的食物添加进来" },
  { type: "extra_food", label: "多识别了食物", description: "移除不属于这餐的食物" },
  { type: "portion_inaccurate", label: "份量不准确", description: "直接调整这餐份量" },
  { type: "other", label: "其他", description: "告诉我们哪里需要改进" },
];

export interface RecognitionResultSnapshotItem {
  id: string;
  name: string;
  quantityG: number | null;
  amount: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  foodId: string | null;
}

export interface RecognitionResultSnapshot {
  mealType: MealType;
  title: string;
  items: RecognitionResultSnapshotItem[];
}

export function feedbackTypeForReason(label: string): RecognitionFeedbackType | null {
  return recognitionFeedbackReasons.find((reason) => reason.label === label)?.type ?? null;
}

function readQuantityG(item: MealItem): number | null {
  const savedQuantity = item.savedNutrition?.quantityG;
  if (Number.isFinite(savedQuantity) && (savedQuantity as number) > 0)
    return savedQuantity as number;
  if (Number.isFinite(item.aiQuantityG) && (item.aiQuantityG as number) > 0)
    return item.aiQuantityG as number;
  const match = item.amount.match(/(\d+(?:\.\d+)?)\s*g/i);
  return match ? Number(match[1]) : null;
}

export function snapshotForRecognition(
  meal: Pick<ScannerMealFixture, "mealType" | "title" | "items">,
): RecognitionResultSnapshot {
  return {
    mealType: meal.mealType,
    title: meal.title.slice(0, 120),
    items: meal.items.slice(0, 40).map((item) => ({
      id: item.id.slice(0, 100),
      name: item.name.slice(0, 100),
      quantityG: readQuantityG(item),
      amount: item.amount.slice(0, 40),
      calories: Number.isFinite(item.calories) ? Math.round(item.calories * 10) / 10 : 0,
      protein: Number.isFinite(item.protein) ? Math.round(item.protein * 10) / 10 : 0,
      carbs: Number.isFinite(item.carbs) ? Math.round(item.carbs * 10) / 10 : 0,
      fat: Number.isFinite(item.fat) ? Math.round(item.fat * 10) / 10 : 0,
      foodId: item.foodId ?? null,
    })),
  };
}

export function withCorrectedItems(meal: ScannerMealFixture, items: MealItem[]): ScannerMealFixture {
  return {
    ...meal,
    items,
    title: items.length === 1 ? items[0].name : items.map((item) => item.name).join("、").slice(0, 120),
    // Advice from the original vision result may describe a food that was removed.
    insight: "营养数据已根据修正后的食物和份量更新，请保存前核对。",
  };
}

export function mealItemFromCatalogFood(
  food: ProductFoodCatalogItem,
  quantityG: number,
  id: string,
): MealItem | null {
  const safeQuantity = Math.min(2000, Math.max(1, Math.round(quantityG)));
  const values = [
    food.caloriesKcalPer100g,
    food.proteinGPer100g,
    food.carbsGPer100g,
    food.fatGPer100g,
  ];
  if (values.some((value) => value == null || !Number.isFinite(value))) return null;
  const scale = safeQuantity / 100;
  const round = (value: number) => Math.round(value * scale * 10) / 10;
  return {
    id,
    name: food.description,
    amount: `${safeQuantity}g`,
    savedNutrition: {
      quantityG: safeQuantity,
      caloriesPer100g: food.caloriesKcalPer100g as number,
      proteinPer100g: food.proteinGPer100g as number,
      carbsPer100g: food.carbsGPer100g as number,
      fatPer100g: food.fatGPer100g as number,
    },
    calories: round(food.caloriesKcalPer100g as number),
    protein: round(food.proteinGPer100g as number),
    carbs: round(food.carbsGPer100g as number),
    fat: round(food.fatGPer100g as number),
    aiQuantityG: safeQuantity,
    foodId: food.id,
    imageUrl: food.imageUrl,
  };
}

export function mealItemFromAnalyzedFood(
  food: {
    name: string;
    quantityG: number;
    caloriesPer100g: number;
    proteinPer100g: number;
    carbsPer100g: number;
    fatPer100g: number;
  },
  id: string,
): MealItem | null {
  const quantityG = Math.min(2000, Math.max(1, Math.round(food.quantityG)));
  const values = [
    food.caloriesPer100g,
    food.proteinPer100g,
    food.carbsPer100g,
    food.fatPer100g,
  ];
  if (!food.name.trim() || values.some((value) => !Number.isFinite(value) || value < 0)) return null;
  const scale = quantityG / 100;
  const scaled = (value: number) => Math.round(value * scale * 10) / 10;
  return {
    id,
    name: food.name.trim(),
    amount: `${quantityG}g`,
    savedNutrition: {
      quantityG,
      caloriesPer100g: food.caloriesPer100g,
      proteinPer100g: food.proteinPer100g,
      carbsPer100g: food.carbsPer100g,
      fatPer100g: food.fatPer100g,
    },
    calories: scaled(food.caloriesPer100g),
    protein: scaled(food.proteinPer100g),
    carbs: scaled(food.carbsPer100g),
    fat: scaled(food.fatPer100g),
    aiQuantityG: quantityG,
    foodId: null,
    imageUrl: null,
  };
}
