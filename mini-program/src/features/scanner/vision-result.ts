import type { ScannerMealFixture } from "./domain";

export interface ProductVisionResult {
  analysisId: string;
  evaluation?: string;
  imageUrl?: string | null;
  imagePath?: string | null;
  nutritionSource?: string;
  mealName: string;
  mealType: ScannerMealFixture["mealType"];
  confidence: number;
  advice: string;
  items: Array<{
    name: string;
    quantityG: number;
    caloriesPer100g: number;
    proteinPer100g: number;
    carbsPer100g: number;
    fatPer100g: number;
    nutritionSource?: string;
  }>;
}

export function normalizeVisionResult(value: unknown, analysisId: string): ProductVisionResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("VISION_RESULT_INVALID");
  }
  const input = value as Record<string, unknown>;
  const nested = input.result && typeof input.result === "object" && !Array.isArray(input.result)
    ? input.result as Record<string, unknown>
    : input;
  const items = nested.items ?? nested.normalizedItems ?? nested.normalized_items;
  if (!Array.isArray(items)) throw new Error("VISION_RESULT_INVALID");
  return { ...nested, analysisId, items } as ProductVisionResult;
}
