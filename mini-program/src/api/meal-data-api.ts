import { type Meal, type MealType } from "../features/meals/domain";
import {
  mapProductMeal,
  type ProductMeal,
  type ProductMealItem,
} from "../features/meals/product-meal-mapper";
import { createClientRequestId } from "../repositories/client-request-id";
import { requestProductApi } from "./product-api-client";

export type { ProductMeal, ProductMealItem } from "../features/meals/product-meal-mapper";

export interface ProductMealInput {
  clientRequestId?: string;
  analysisId?: string | null;
  mealType: MealType;
  name: string;
  recordedAt: string;
  isFavorite?: boolean;
  portionMultiplier?: number | null;
  imageUrl?: string | null;
  imagePath?: string | null;
  items: Array<Omit<ProductMealItem, "id">>;
}

export { mapProductMeal } from "../features/meals/product-meal-mapper";

const remoteMealIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isRemoteMealId(id: string | undefined): id is string {
  return typeof id === "string" && remoteMealIdPattern.test(id);
}

export async function getProductMeals(date: string): Promise<Meal[]> {
  const data = await requestProductApi<ProductMeal[]>(`/meals?date=${encodeURIComponent(date)}`, {
    method: "GET",
    fallbackMessage: "餐食同步失败，请稍后重试",
  });
  return data.map(mapProductMeal);
}

export async function getProductMealsRange(
  from: string,
  to: string,
  options: { light?: boolean } = {},
): Promise<Meal[]> {
  const params = new URLSearchParams({ from, to });
  if (options.light) params.set("light", "1");
  const data = await requestProductApi<ProductMeal[]>(
    `/meals?${params.toString()}`,
    { method: "GET", fallbackMessage: "餐食同步失败，请稍后重试" },
  );
  return data.map(mapProductMeal);
}

export async function getProductMeal(id: string): Promise<Meal | null> {
  const data = await requestProductApi<ProductMeal | null>(`/meals/${encodeURIComponent(id)}`, {
    method: "GET",
    fallbackMessage: "餐食同步失败，请稍后重试",
  });
  return data ? mapProductMeal(data) : null;
}

export async function createProductMeal(input: ProductMealInput): Promise<Meal> {
  const data = await requestProductApi<ProductMeal>("/meals", {
    method: "POST",
    data: { ...input, clientRequestId: input.clientRequestId ?? createClientRequestId() },
    fallbackMessage: "餐食同步失败，请稍后重试",
  });
  return mapProductMeal(data);
}

export async function updateProductMeal(
  id: string,
  input: Partial<
    Pick<ProductMealInput, "mealType" | "name" | "recordedAt" | "isFavorite" | "portionMultiplier" | "items">
  >,
): Promise<Meal | null> {
  const data = await requestProductApi<ProductMeal | null>(`/meals/${id}`, {
    method: "PATCH",
    data: input,
    fallbackMessage: "餐食同步失败，请稍后重试",
  });
  return data ? mapProductMeal(data) : null;
}

export function deleteProductMeal(id: string) {
  return requestProductApi<{ deleted: boolean }>(`/meals/${id}`, {
    method: "DELETE",
    fallbackMessage: "餐食同步失败，请稍后重试",
  });
}

export interface ProductMealAnalysis {
  id: string;
  mealName: string;
  advice: string;
  items: Array<Omit<ProductMealItem, "id">>;
}

export function analyzeProductMeal(items: Array<Pick<ProductMealItem, "name" | "quantityG">>) {
  return requestProductApi<ProductMealAnalysis>("/meal-analysis", {
    method: "POST",
    data: { clientRequestId: createClientRequestId(), items },
    fallbackMessage: "餐食分析失败，请稍后重试",
  });
}
