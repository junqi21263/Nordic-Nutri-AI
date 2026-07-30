import type { Achievement } from "../features/coach/domain";
import type { DailyTargets } from "../features/meals/domain";
import { requestProductApi } from "./product-api-client";

export interface ProductDailyInsight {
  focus: "protein" | "calories" | "carbs" | "fat" | "fiber" | "logging" | "regularity";
  headline: string;
  content: string;
  source: "cloudbase" | "deepseek" | "hunyuan-exp" | "rule_v3";
  model: string | null;
  cached: boolean;
}

export interface ProductDailySummary {
  date: string;
  serverTime: string;
  serverDate: string;
  targets: DailyTargets;
  consumed: DailyTargets;
  remaining: DailyTargets;
  excess: DailyTargets;
  progress: Record<keyof DailyTargets, {
    consumed: number;
    target: number;
    percent: number;
    remaining: number;
    excess: number;
  }>;
  completion: number;
  insight: ProductDailyInsight;
}

export interface ProductWeeklyReview {
  startDate: string;
  endDate: string;
  score: number;
  recordedMeals: number;
  recordedDays: number;
  serverTime: string;
  serverDate: string;
  targets: DailyTargets;
  weeklyTargets: DailyTargets;
  proteinCompletion: number;
  calorieCompletion: number;
  carbsCompletion: number;
  fatCompletion: number;
  consistency: number;
  nutritionCompletion: number;
  calorieTarget: number;
  consumed: DailyTargets;
  progress: ProductDailySummary["progress"];
  rhythm: Array<{ date: string; recorded: boolean }>;
  insight: {
    headline: string;
    summary: string;
    strengths: string[];
    nextSteps: string[];
    source: "deepseek" | "rule_v1";
    model: string | null;
    cached: boolean;
  };
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
