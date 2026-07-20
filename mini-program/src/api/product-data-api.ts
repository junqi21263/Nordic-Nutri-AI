import Taro from "@tarojs/taro";
import { useAuthStore } from "../auth/auth-store";

const endpoint = "https://lewis-healthy-d4glgqqzv73a5bc10.service.tcloudbase.com/get-login-ticket";

async function postProductData<T>(path: string, payload: Record<string, unknown>): Promise<T> {
  const token = useAuthStore.getState().session?.accessToken;
  if (!token) throw new Error("登录状态已失效，请重新登录");
  const response = await Taro.request<unknown>({
    url: `${endpoint}${path}`,
    method: "POST",
    header: { "content-type": "application/json", authorization: `Bearer ${token}` },
    data: payload,
  });
  const data = response.data as T & { code?: unknown };
  if (response.statusCode !== 200) {
    const error = new Error("资料保存失败，请稍后重试");
    error.name = typeof data.code === "string" ? data.code : "ProductDataRequestError";
    throw error;
  }
  return data;
}

export async function getProductAccount() {
  const token = useAuthStore.getState().session?.accessToken;
  if (!token) throw new Error("登录状态已失效，请重新登录");
  const response = await Taro.request<unknown>({ url: `${endpoint}/account`, method: "GET", header: { authorization: `Bearer ${token}` } });
  if (response.statusCode !== 200) throw new Error("账号资料读取失败，请稍后重试");
  return response.data as {
    nickname: string | null;
    age: number | null;
    sex: "female" | "male" | "undisclosed" | null;
    heightCm: number | null;
    weightKg: number | null;
    activityLevel: "sedentary" | "light" | "moderate" | "high" | "very_high" | null;
    trainingDays: number | null;
    goalType: "muscle_gain" | "fat_loss" | "maintain" | "performance" | null;
    targetWeightKg: number | null;
    targetCaloriesKcal: number | null;
  };
}

export function saveProductProfile(input: { nickname: string }) {
  return postProductData<{ id: string; nickname: string }>("/profile", input);
}

export function saveProductBodyProfile(input: {
  age: number; birthDate: string | null; sex: "female" | "male" | "undisclosed";
  heightCm: number; weightKg: number; activityLevel: "sedentary" | "light" | "moderate" | "high" | "very_high"; trainingDays: number;
}) {
  return postProductData<{ id: string }>("/body-profile", input);
}

export function saveProductGoal(input: {
  goalType: "muscle_gain" | "fat_loss" | "maintain" | "performance";
  targetWeightKg: number | null;
  targetCaloriesKcal: number | null;
  targetDate: string | null;
}) {
  return postProductData<{ id: string }>("/goal", input);
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
  return postProductData<{ userId: string; nutritionPlanId: string }>("/onboarding", input);
}
