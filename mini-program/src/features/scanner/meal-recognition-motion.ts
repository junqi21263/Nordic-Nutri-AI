export const mealRecognitionMotionConfig = {
  baseRevealAtMs: 0,
  baseRevealDurationMs: 280,
  nutritionRevealAtMs: 250,
  nutritionRevealDurationMs: 340,
  metricsCountAtMs: 600,
  countDurationMs: 760,
  contentRevealAtMs: 1400,
  contentRevealDurationMs: 250,
  contentStaggerMs: 80,
  macroStaggerMs: 60,
  bottomActionRevealAtMs: 2400,
  bottomActionDurationMs: 700,
  completeAtMs: 3100,
  easing: "cubic-bezier(.22, 1, .36, 1)",
} as const;

export type MealRecognitionMotionPhase =
  | "idle"
  | "baseReveal"
  | "nutritionReveal"
  | "metricsCount"
  | "contentReveal"
  | "bottomActionReveal"
  | "complete";

/**
 * The route flag survives the scanner-to-result native page transition.
 * The in-memory pending value remains as a compatibility fallback for an
 * already-open result page and local replay paths.
 */
export function shouldPlayMealRecognitionReveal(revealParam?: string, pending = false) {
  return revealParam === "1" || pending;
}

export function getMealRecognitionMotionPhaseSchedule(): Array<{
  atMs: number;
  phase: Exclude<MealRecognitionMotionPhase, "idle">;
}> {
  return [
    { atMs: mealRecognitionMotionConfig.baseRevealAtMs, phase: "baseReveal" },
    { atMs: mealRecognitionMotionConfig.nutritionRevealAtMs, phase: "nutritionReveal" },
    { atMs: mealRecognitionMotionConfig.metricsCountAtMs, phase: "metricsCount" },
    { atMs: mealRecognitionMotionConfig.contentRevealAtMs, phase: "contentReveal" },
    { atMs: mealRecognitionMotionConfig.bottomActionRevealAtMs, phase: "bottomActionReveal" },
    { atMs: mealRecognitionMotionConfig.completeAtMs, phase: "complete" },
  ];
}

export function getMealRecognitionMotionSchedule(itemCount: number) {
  const safeItemCount = Math.max(0, Math.floor(itemCount));
  return {
    ingredientDelaysMs: Array.from({ length: safeItemCount }, (_, index) => index * mealRecognitionMotionConfig.contentStaggerMs),
    macroDelaysMs: Array.from({ length: 3 }, (_, index) => index * mealRecognitionMotionConfig.macroStaggerMs),
  };
}
