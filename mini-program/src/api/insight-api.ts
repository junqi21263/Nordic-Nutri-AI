import type { Achievement } from "../features/coach/domain";
import type { DailyTargets } from "../features/meals/domain";
import { requestProductApi } from "./product-api-client";

const summaryInflight = new Map<string, Promise<ProductDailySummary>>();

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
  /** Present when meal-summary embeds the day meal list to avoid a second /meals round-trip. */
  meals?: import("./meal-data-api").ProductMeal[];
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

export function getProductDailySummary(date: string, options: { light?: boolean } = {}) {
  const params = new URLSearchParams({ date });
  if (options.light) params.set("light", "1");
  const key = `${date}:${options.light ? "light" : "full"}`;
  const existing = summaryInflight.get(key);
  if (existing) return existing;
  const request = requestProductApi<ProductDailySummary>(`/meal-summary?${params.toString()}`, {
    method: "GET",
    fallbackMessage: "营养数据读取失败，请稍后重试",
  }).finally(() => {
    if (summaryInflight.get(key) === request) summaryInflight.delete(key);
  });
  summaryInflight.set(key, request);
  return request;
}

export function getProductWeeklyReview(date: string, options: { preferFast?: boolean } = {}) {
  const params = new URLSearchParams({ date });
  if (options.preferFast) params.set("preferFast", "1");
  return requestProductApi<ProductWeeklyReview>(`/weekly-review?${params.toString()}`, {
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

export interface ProductAchievementEvaluation {
  achievements: Achievement[];
  newlyUnlocked: Achievement[];
}

export function evaluateProductAchievements(date: string) {
  return requestProductApi<ProductAchievementEvaluation>("/achievements/evaluate", {
    method: "POST",
    data: { date },
    fallbackMessage: "成就进度更新失败，请稍后重试",
  });
}

export function acknowledgeProductAchievementCelebration(achievementId: string) {
  return requestProductApi<{ acknowledged: boolean }>(
    `/achievements/${encodeURIComponent(achievementId)}/celebrate`,
    {
      method: "POST",
      data: {},
      fallbackMessage: "成就庆祝确认失败，请稍后重试",
    },
  );
}
