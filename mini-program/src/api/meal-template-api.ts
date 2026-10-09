import { requestProductApi } from "./product-api-client";
import { mapProductMeal, type ProductMealInput } from "./meal-data-api";

export interface MealTemplate {
  id: string;
  sourceMealId: string | null;
  name: string;
  mealType: ProductMealInput["mealType"];
  items: ProductMealInput["items"];
  imageUrl: string | null;
  useCount: number;
  lastRecordedAt: string | null;
}
export const getMealTemplates = () => requestProductApi<MealTemplate[]>("/meal-templates", { method: "GET", fallbackMessage: "常吃加载失败，请重试" });
export const getMealTemplate = (id: string) => requestProductApi<MealTemplate | null>(`/meal-templates/${encodeURIComponent(id)}`, { method: "GET", fallbackMessage: "常吃加载失败，请重试" });
export const saveMealTemplate = (sourceMealId: string) => requestProductApi<MealTemplate>("/meal-templates", { method: "POST", data: { sourceMealId }, fallbackMessage: "保存常吃失败，请重试" });
export const updateMealTemplate = (id: string, input: Pick<MealTemplate, "name" | "mealType" | "items">) => requestProductApi<MealTemplate | null>(`/meal-templates/${encodeURIComponent(id)}`, { method: "PATCH", data: input, fallbackMessage: "更新常吃失败，请重试" });
export const deleteMealTemplate = (id: string) => requestProductApi<{ deleted: boolean }>(`/meal-templates/${encodeURIComponent(id)}`, { method: "DELETE", fallbackMessage: "删除常吃失败，请重试" });
export function templateToMeal(template: MealTemplate) {
  return mapProductMeal({ ...template, recordedAt: new Date().toISOString(), isFavorite: false, items: template.items.map((item, index) => ({ ...item, id: String(index) })) });
}
export function templateLastUsed(value: string | null) {
  if (!value) return "尚未使用";
  return new Date(value).toLocaleDateString("zh-CN", { timeZone: "Asia/Shanghai" });
}
