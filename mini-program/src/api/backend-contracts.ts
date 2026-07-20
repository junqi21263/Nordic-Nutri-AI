// Inactive Phase 1 contract types. No page imports this module yet: fixture
// stores remain the default UI data source until visual freeze and integration.
export type ApiErrorCode =
  | "UNAUTHORIZED" | "FORBIDDEN" | "VALIDATION_ERROR" | "NOT_FOUND" | "CONFLICT"
  | "RATE_LIMITED" | "AI_SERVICE_ERROR" | "STORAGE_ERROR" | "DATABASE_ERROR"
  | "NOT_IMPLEMENTED" | "INTERNAL_ERROR";

export type ApiResponse<T> =
  | { success: true; data: T; meta: Record<string, unknown>; requestId: string }
  | { success: false; error: { code: ApiErrorCode; message: string; details?: Record<string, unknown>; retryable: boolean }; requestId: string };

export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export interface ProfileInput { nickname?: string | null; avatarPath?: string | null; timezone?: string; }
export interface BodyProfileInput { age: number; sex: "female" | "male" | "undisclosed"; heightCm: number; weightKg: number; activityLevel: "sedentary" | "light" | "moderate" | "high" | "very_high"; trainingDaysPerWeek: number; }
export interface HealthGoalInput { goalType: "muscle_gain" | "fat_loss" | "maintain" | "performance"; targetWeightKg?: number | null; targetDate?: string | null; }
export interface MealItemInput { foodId?: string | null; name: string; aiQuantityG?: number | null; confirmedQuantityG: number; caloriesPer100g: number; proteinGPer100g: number; carbsGPer100g: number; fatGPer100g: number; }
export interface MealRecordInput { clientRequestId: string; name: string; mealType: MealType; recordedAt: string; planId?: string | null; imagePath?: string | null; isFavorite?: boolean; items: MealItemInput[]; }
export interface MealListQuery { date?: string; mealType?: MealType; keyword?: string; favorite?: boolean; limit?: number; offset?: number; order?: "recorded_at.desc" | "recorded_at.asc"; }
