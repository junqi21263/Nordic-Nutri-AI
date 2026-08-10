export const mealRecognitionMotionConfig = {
  photoMs: 300,
  statusAtMs: 300,
  foodAtMs: 700,
  foodStaggerMs: 90,
  foodEnterMs: 250,
  nutritionAtMs: 1600,
  nutritionEnterMs: 340,
  countAtMs: 1900,
  countDurationMs: 760,
  macroStaggerMs: 60,
  actionAtMs: 2700,
  actionEnterMs: 280,
  completeAtMs: 3200,
  easing: "cubic-bezier(.22, 1, .36, 1)",
} as const;

export function getMealRecognitionMotionSchedule(itemCount: number) {
  const safeItemCount = Math.max(0, Math.floor(itemCount));
  return {
    foodDelaysMs: Array.from(
      { length: safeItemCount },
      (_, index) => mealRecognitionMotionConfig.foodAtMs + index * mealRecognitionMotionConfig.foodStaggerMs,
    ),
    macroCountDelaysMs: Array.from(
      { length: 3 },
      (_, index) => mealRecognitionMotionConfig.countAtMs + index * mealRecognitionMotionConfig.macroStaggerMs,
    ),
  };
}
