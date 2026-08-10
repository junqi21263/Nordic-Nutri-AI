import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  getMealRecognitionMotionSchedule,
  mealRecognitionMotionConfig,
} from "../src/features/scanner/meal-recognition-motion";

const srcRoot = resolve(import.meta.dirname, "../src");
const read = (relativePath: string) => readFileSync(resolve(srcRoot, relativePath), "utf8");

describe("meal recognition result reveal motion", () => {
  it("keeps the approved timing in one schedule", () => {
    expect(mealRecognitionMotionConfig.completeAtMs).toBe(3200);
    expect(mealRecognitionMotionConfig.foodStaggerMs).toBe(90);
    expect(mealRecognitionMotionConfig.macroStaggerMs).toBe(60);
    expect(mealRecognitionMotionConfig.easing).toBe("cubic-bezier(.22, 1, .36, 1)");
  });

  it("derives stagger delays from the real food count", () => {
    const schedule = getMealRecognitionMotionSchedule(3);
    expect(schedule.foodDelaysMs).toEqual([700, 790, 880]);
    expect(schedule.macroCountDelaysMs).toEqual([1900, 1960, 2020]);
  });

  it("keeps controller and counter animation lightweight and cancellable", () => {
    const controller = read("hooks/useMealRecognitionMotion.ts");
    const counter = read("hooks/useCountUp.ts");
    expect(controller).toContain('"imageReady"');
    expect(controller).toContain('"actionReveal"');
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

  it("keeps replay development-only and free of recognition requests", () => {
    const page = read("pages/analysis-result/index.tsx");
    expect(page).toContain('process.env.NODE_ENV !== "production"');
    expect(page).toContain("setReplayKey");
    expect(page).not.toContain("analyzeProductImage");
  });
});
