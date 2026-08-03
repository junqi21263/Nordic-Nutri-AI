import { createClientRequestId } from "../repositories/client-request-id";
import { requestProductApi } from "./product-api-client";

export interface ProductSettings {
  dietaryPattern: string | null;
  foodAvoidances: string[];
  mealsPerDay: number;
  theme: "light" | "dark" | "system";
  language: "zh-CN" | "en";
  notification: boolean;
  unit: "metric" | "imperial";
}

export interface ProductNutritionPlan {
  id: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  status: string;
}

export interface ProductAccount {
  nickname: string | null;
  avatarUrl: string | null;
  age: number | null;
  sex: "female" | "male" | "undisclosed" | null;
  heightCm: number | null;
  weightKg: number | null;
  activityLevel: "sedentary" | "light" | "moderate" | "high" | "very_high" | null;
  trainingDays: number | null;
  goalType: "muscle_gain" | "fat_loss" | "maintain" | "performance" | null;
  targetWeightKg: number | null;
  targetCaloriesKcal: number | null;
  settings: ProductSettings | null;
  nutritionPlan: ProductNutritionPlan | null;
  onboardingCompleted?: boolean;
}

export function getProductAccount() {
  return requestProductApi<ProductAccount>("/account", {
    method: "GET",
    fallbackMessage: "账号资料读取失败，请稍后重试",
  });
}

export function cancelProductAccount(clientRequestId = createClientRequestId()) {
  return requestProductApi<{ deleted: boolean }>("/account/cancel", {
    method: "POST",
    data: {
      confirmation: "DELETE_MY_NORDIC_NUTRI_ACCOUNT",
      clientRequestId,
    },
    fallbackMessage: "账号注销失败，请稍后重试",
  });
}

export function saveProductProfile(input: { nickname: string }) {
  return requestProductApi<{ id: string; nickname: string }>("/profile", {
    method: "POST",
    data: { ...input },
    fallbackMessage: "资料保存失败，请稍后重试",
  });
}

export function uploadProductAvatar(input: { mimeType: "image/jpeg" | "image/png" | "image/webp"; base64: string }) {
  return requestProductApi<{ avatarUrl: string }>("/profile/avatar", {
    method: "POST",
    data: input,
    fallbackMessage: "头像上传失败，请稍后重试",
  });
}

export function saveProductBodyProfile(input: {
  age: number;
  birthDate: string | null;
  sex: "female" | "male" | "undisclosed";
  heightCm: number;
  weightKg: number;
  activityLevel: "sedentary" | "light" | "moderate" | "high" | "very_high";
  trainingDays: number;
}) {
  return requestProductApi<{ id: string }>("/body-profile", {
    method: "POST",
    data: { ...input },
    fallbackMessage: "身体资料保存失败，请稍后重试",
  });
}

export function saveProductGoal(input: {
  goalType: "muscle_gain" | "fat_loss" | "maintain" | "performance";
  targetWeightKg: number | null;
  targetCaloriesKcal: number | null;
  targetDate: string | null;
}) {
  return requestProductApi<{ id: string }>("/goal", {
    method: "POST",
    data: input,
    fallbackMessage: "目标保存失败，请稍后重试",
  });
}

export function completeProductOnboarding(input: {
  nickname: string;
  goalType: "muscle_gain" | "fat_loss" | "maintain" | "performance";
  targetWeightKg: number | null;
  targetDate: string | null;
  age: number;
  sex: "female" | "male" | "undisclosed";
  heightCm: number;
  weightKg: number;
  activityLevel: "sedentary" | "light" | "moderate" | "high" | "very_high";
  trainingDays: number;
  dietaryPattern: string;
  foodAvoidances: string[];
  mealsPerDay: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}) {
  return requestProductApi<{ userId: string; nutritionPlanId: string }>("/onboarding", {
    method: "POST",
    data: input,
    fallbackMessage: "资料初始化失败，请稍后重试",
  });
}

export function saveProductSettings(input: ProductSettings) {
  return requestProductApi<ProductSettings>("/settings", {
    method: "PATCH",
    data: { ...input },
    fallbackMessage: "设置保存失败，请稍后重试",
  });
}

export function getProductNutritionPlan() {
  return requestProductApi<ProductNutritionPlan | null>("/nutrition-plan", {
    method: "GET",
    fallbackMessage: "营养计划读取失败，请稍后重试",
  });
}

export interface NutritionPlanPreviewResult {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  insight?: string | null;
  source?: "deepseek" | "formula" | string;
}

export function previewProductNutritionPlan(input: {
  age: number;
  sex: "female" | "male" | "undisclosed";
  heightCm: number;
  weightKg: number;
  activityLevel: "sedentary" | "light" | "moderate" | "high" | "very_high";
  trainingDays: number;
  goalType: "muscle_gain" | "fat_loss" | "maintenance" | "maintain" | "performance";
  dietaryPattern?: string;
  foodAvoidances?: string[];
  mealsPerDay?: number;
}) {
  return requestProductApi<NutritionPlanPreviewResult>("/nutrition-plan/preview", {
    method: "POST",
    data: input,
    fallbackMessage: "营养计划计算失败，请稍后重试",
  });
}

export function saveProductNutritionPlan(
  input: Pick<ProductNutritionPlan, "calories" | "proteinG" | "carbsG" | "fatG">,
) {
  return requestProductApi<ProductNutritionPlan>("/nutrition-plan", {
    method: "PATCH",
    data: { ...input },
    fallbackMessage: "营养计划保存失败，请稍后重试",
  });
}
