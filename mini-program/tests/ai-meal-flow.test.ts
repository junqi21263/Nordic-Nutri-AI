import { describe, expect, it } from "vitest";
import {
  createMealFromAnalysis,
  createScannerFixtures,
  getAdjustedAnalysis,
  pickScannerCandidates,
} from "../src/features/scanner/domain";
import { createAnalysisStore } from "../src/stores/analysis-store";
import { createMealStore } from "../src/stores/meal-store";
import { createPortionDraftStore } from "../src/stores/portion-draft-store";
import { createScannerStore } from "../src/stores/scanner-store";

describe("local AI meal flow", () => {
  it("provides at least twenty local meals and returns five to ten random candidates", () => {
    const fixtures = createScannerFixtures();
    expect(fixtures.length).toBeGreaterThanOrEqual(20);
    expect(pickScannerCandidates(fixtures, () => 0.37).length).toBeGreaterThanOrEqual(5);
    expect(pickScannerCandidates(fixtures, () => 0.37).length).toBeLessThanOrEqual(10);
  });

  it("adjusts every nutrient locally with portion changes and recalculates score", () => {
    const meal = createScannerFixtures()[0]!;
    const base = getAdjustedAnalysis(meal, 1);
    const doubled = getAdjustedAnalysis(meal, 2);
    expect(doubled.calories).toBe(base.calories * 2);
    expect(doubled.protein).toBe(base.protein * 2);
    expect(doubled.score).toBeDefined();
  });

  it("moves a captured fixture through scanner, analysis, draft and mealStore save", () => {
    const fixture = createScannerFixtures()[0]!;
    const scanner = createScannerStore(createScannerFixtures());
    scanner.getState().setCapturedMeal(fixture);
    const analysis = createAnalysisStore();
    analysis.getState().setAnalysis(fixture);
    const portion = createPortionDraftStore();
    portion.getState().start(fixture);
    portion.getState().setMultiplier(1.5);
    const meals = createMealStore([], "2026-07-13");
    const id = meals
      .getState()
      .addMeal(createMealFromAnalysis(fixture, 1.5, "2026-07-13", "12:00"));
    expect(scanner.getState().capturedMeal?.id).toBe(fixture.id);
    expect(analysis.getState().analysis?.id).toBe(fixture.id);
    expect(meals.getState().getMealById(id)?.items[0]?.calories).toBeGreaterThan(
      fixture.items[0]!.calories,
    );
  });

  it("resets local scanner, analysis and portion state", () => {
    const fixture = createScannerFixtures()[0]!;
    const scanner = createScannerStore(createScannerFixtures());
    const analysis = createAnalysisStore();
    const portion = createPortionDraftStore();
    scanner.getState().setCapturedMeal(fixture);
    analysis.getState().setAnalysis(fixture);
    portion.getState().start(fixture);
    scanner.getState().reset();
    analysis.getState().reset();
    portion.getState().reset();
    expect(scanner.getState().capturedMeal).toBeNull();
    expect(analysis.getState().analysis).toBeNull();
    expect(portion.getState().meal).toBeNull();
  });

  it("consumes a recognition result reveal marker only once", () => {
    const scanner = createScannerStore(createScannerFixtures());

    expect(scanner.getState().resultRevealPending).toBe(false);
    scanner.getState().markResultRevealPending();
    expect(scanner.getState().consumeResultRevealPending()).toBe(true);
    expect(scanner.getState().consumeResultRevealPending()).toBe(false);

    scanner.getState().markResultRevealPending();
    scanner.getState().reset();
    expect(scanner.getState().resultRevealPending).toBe(false);
  });
});
