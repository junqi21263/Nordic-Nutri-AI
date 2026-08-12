export interface MealSavedProgressInput {
  beforeCalories: number;
  currentCalories: number;
  targetCalories: number;
}

export const mealSavedCelebrationMotion = {
  totalDurationMs: 2300,
  backdropDurationMs: 300,
  cardDelayMs: 500,
  cardDurationMs: 600,
  ringDurationMs: 520,
  checkDelayMs: 1030,
  checkDurationMs: 260,
  nutritionStartMs: 1400,
  nutritionStaggerMs: 100,
  progressStartMs: 1800,
  ctaStartMs: 1900,
} as const;

export function getMealSavedCelebrationMotion(kind: "created" | "updated") {
  void kind;
  return mealSavedCelebrationMotion;
}

function percent(value: number, target: number) {
  if (!Number.isFinite(target) || target <= 0) return value > 0 ? 100 : 0;
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round((value / target) * 10000) / 100));
}

export function getMealSavedProgress({
  beforeCalories,
  currentCalories,
  targetCalories,
}: MealSavedProgressInput) {
  return {
    from: percent(beforeCalories, targetCalories),
    to: percent(currentCalories, targetCalories),
  };
}
