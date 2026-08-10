import { describe, expect, it } from "vitest";
import {
  getMealRecognitionMotionPhaseSchedule,
  getMealRecognitionMotionSchedule,
  mealRecognitionMotionConfig,
  shouldPlayMealRecognitionReveal,
} from "./meal-recognition-motion";

describe("meal recognition motion", () => {
  it("orders the frozen result UI from base to bottom actions", () => {
    expect(mealRecognitionMotionConfig.baseRevealAtMs).toBe(0);
    expect(mealRecognitionMotionConfig.nutritionRevealAtMs).toBeGreaterThan(
      mealRecognitionMotionConfig.baseRevealAtMs,
    );
    expect(mealRecognitionMotionConfig.metricsCountAtMs).toBeGreaterThan(
      mealRecognitionMotionConfig.nutritionRevealAtMs,
    );
    expect(mealRecognitionMotionConfig.contentRevealAtMs).toBeGreaterThan(
      mealRecognitionMotionConfig.metricsCountAtMs,
    );
    expect(mealRecognitionMotionConfig.bottomActionRevealAtMs).toBeGreaterThan(
      mealRecognitionMotionConfig.contentRevealAtMs,
    );
  });

  it("stages ingredient and macro rows without hard-coded item counts", () => {
    const schedule = getMealRecognitionMotionSchedule(2);

    expect(schedule.ingredientDelaysMs).toEqual([0, mealRecognitionMotionConfig.contentStaggerMs]);
    expect(schedule.macroDelaysMs).toEqual([
      0,
      mealRecognitionMotionConfig.macroStaggerMs,
      mealRecognitionMotionConfig.macroStaggerMs * 2,
    ]);
  });

  it("exposes each named reveal phase in chronological order", () => {
    expect(getMealRecognitionMotionPhaseSchedule().map((entry) => entry.phase)).toEqual([
      "baseReveal",
      "nutritionReveal",
      "metricsCount",
      "contentReveal",
      "bottomActionReveal",
      "complete",
    ]);
  });

  it("uses the explicit result route flag when deciding whether to reveal", () => {
    expect(shouldPlayMealRecognitionReveal("1", false)).toBe(true);
    expect(shouldPlayMealRecognitionReveal(undefined, true)).toBe(true);
    expect(shouldPlayMealRecognitionReveal(undefined, false)).toBe(false);
  });

  it("starts the fixed action bar only after the content metrics have finished", () => {
    const finalContentMetricAtMs =
      mealRecognitionMotionConfig.contentRevealAtMs +
      mealRecognitionMotionConfig.macroStaggerMs * 2 +
      mealRecognitionMotionConfig.countDurationMs;

    expect(mealRecognitionMotionConfig.bottomActionRevealAtMs).toBeGreaterThan(finalContentMetricAtMs);
    expect(mealRecognitionMotionConfig.bottomActionDurationMs).toBe(700);
    expect(mealRecognitionMotionConfig.completeAtMs).toBe(
      mealRecognitionMotionConfig.bottomActionRevealAtMs + mealRecognitionMotionConfig.bottomActionDurationMs,
    );
  });
});
