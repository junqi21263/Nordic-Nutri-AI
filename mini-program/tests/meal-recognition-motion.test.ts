import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getMealRecognitionMotionPhaseSchedule,
  getMealRecognitionMotionSchedule,
  mealRecognitionMotionConfig,
} from "../src/features/scanner/meal-recognition-motion";

const srcRoot = resolve(import.meta.dirname, "../src");
const read = (relativePath: string) => readFileSync(resolve(srcRoot, relativePath), "utf8");

describe("meal recognition result reveal motion", () => {
  it("keeps the approved timing in one schedule", () => {
    expect(mealRecognitionMotionConfig.baseRevealAtMs).toBe(0);
    expect(mealRecognitionMotionConfig.nutritionRevealAtMs).toBe(250);
    expect(mealRecognitionMotionConfig.metricsCountAtMs).toBe(600);
    expect(mealRecognitionMotionConfig.contentRevealAtMs).toBe(1400);
    expect(mealRecognitionMotionConfig.bottomActionRevealAtMs).toBe(2200);
    expect(mealRecognitionMotionConfig.completeAtMs).toBe(2600);
    expect(mealRecognitionMotionConfig.contentStaggerMs).toBe(80);
    expect(mealRecognitionMotionConfig.macroStaggerMs).toBe(60);
    expect(mealRecognitionMotionConfig.easing).toBe("cubic-bezier(.22, 1, .36, 1)");
  });

  it("derives stagger delays from the real food count", () => {
    const schedule = getMealRecognitionMotionSchedule(3);
    expect(schedule.ingredientDelaysMs).toEqual([0, 80, 160]);
    expect(schedule.macroDelaysMs).toEqual([0, 60, 120]);
  });

  it("keeps controller and counter animation lightweight and cancellable", () => {
    const controller = read("hooks/useMealRecognitionMotion.ts");
    const counter = read("hooks/useCountUp.ts");
    expect(controller).toContain("getMealRecognitionMotionPhaseSchedule");
    expect(getMealRecognitionMotionPhaseSchedule().map((entry) => entry.phase)).toEqual([
      "baseReveal",
      "nutritionReveal",
      "metricsCount",
      "contentReveal",
      "bottomActionReveal",
      "complete",
    ]);
    expect(controller).toContain("clearTimeout");
    expect(counter).toContain("requestAnimationFrame");
    expect(counter).toContain("cancelAnimationFrame");
  });

  it("wires motion only to the true scanner-to-result transition", () => {
    const page = read("pages/analysis-result/index.tsx");
    const styles = read("styles/page.scss");
    expect(page).toContain("consumeResultRevealPending");
    expect(page).toContain("useMealRecognitionMotion");
    expect(page).toContain("data-recognition-reveal");
    expect(styles).toContain("data-recognition-reveal");
    expect(styles).toContain("analysis-result-page__summary-image");
    expect(styles).toContain("analysis-result-page__ai-status");
    expect(styles).toContain("analysis-result-page__actions");
    expect(styles).toContain('[data-reduced-motion="true"]');
  });

  it("keeps scan-result actions fixed without changing their existing handlers", () => {
    const page = read("pages/analysis-result/index.tsx");
    const styles = read("styles/page.scss");
    const layout = read("styles/layout.scss");

    expect(page).toContain('className="analysis-result-page__bottom-bar"');
    expect(page).toContain('className="nutrition-disclaimer"');
    expect(page).toContain('className="analysis-result-page__actions"');
    expect(page).toContain('data-motion-layer="bottom"');
    expect(styles).toContain(".analysis-result-page__bottom-bar");
    expect(styles).toContain("position: fixed");
    expect(styles).toContain(".analysis-result-page__bottom-bar .analysis-result-page__actions");
    expect(layout).toContain("--analysis-result-bottom-bar-height");
  });

  it("keeps replay development-only and free of recognition requests", () => {
    const page = read("pages/analysis-result/index.tsx");
    expect(page).toContain('process.env.NODE_ENV !== "production"');
    expect(page).toContain("setReplayKey");
    expect(page).not.toContain("analyzeProductImage");
  });
});
