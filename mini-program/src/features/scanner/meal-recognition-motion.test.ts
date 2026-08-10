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

  it("starts the fixed action bar with its own native timing during the final metric beat", () => {
    expect(mealRecognitionMotionConfig.bottomActionNativeRevealAtMs).toBeGreaterThanOrEqual(800);
    expect(mealRecognitionMotionConfig.bottomActionNativeRevealAtMs).toBeLessThanOrEqual(900);
    expect(mealRecognitionMotionConfig.bottomActionShellDurationMs).toBe(390);
    expect(mealRecognitionMotionConfig.bottomActionShellPauseMs).toBeGreaterThanOrEqual(100);
    expect(mealRecognitionMotionConfig.bottomActionShellPauseMs).toBeLessThanOrEqual(140);
    expect(mealRecognitionMotionConfig.bottomActionAdjustStartMs).toBeGreaterThan(
      mealRecognitionMotionConfig.bottomActionShellDurationMs,
    );
    expect(mealRecognitionMotionConfig.bottomActionSaveStartMs).toBeGreaterThan(
      mealRecognitionMotionConfig.bottomActionAdjustStartMs,
    );
  });
});
