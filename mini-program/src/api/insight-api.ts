import type { Achievement } from "../features/coach/domain";
import type { DailyTargets } from "../features/meals/domain";
import { requestProductApi } from "./product-api-client";

export interface ProductDailySummary {
  date: string;
  targets: DailyTargets;
  consumed: DailyTargets;
  remaining: DailyTargets;
  completion: number;
}

export interface ProductWeeklyReview {
  startDate: string;
  endDate: string;
  score: number;
  recordedMeals: number;
  recordedDays: number;
  proteinCompletion: number;
  calorieTarget: number;
  consumed: DailyTargets;
  rhythm: Array<{ date: string; recorded: boolean }>;
}

export function getProductDailySummary(date: string) {
  return requestProductApi<ProductDailySummary>(`/meal-summary?date=${encodeURIComponent(date)}`, {
    method: "GET",
    fallbackMessage: "营养数据读取失败，请稍后重试",
  });
}

export function getProductWeeklyReview(date: string) {
  return requestProductApi<ProductWeeklyReview>(`/weekly-review?date=${encodeURIComponent(date)}`, {
    method: "GET",
    fallbackMessage: "营养数据读取失败，请稍后重试",
  });
}

export function getProductAchievements(date: string) {
  return requestProductApi<Achievement[]>(`/achievements?date=${encodeURIComponent(date)}`, {
    method: "GET",
    fallbackMessage: "营养数据读取失败，请稍后重试",
  });
}
