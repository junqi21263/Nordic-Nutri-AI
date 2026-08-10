import { describe, expect, it } from "vitest";
import {
  getMealRecognitionMotionPhaseSchedule,
  getMealRecognitionMotionSchedule,
  mealRecognitionMotionConfig,
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
});
