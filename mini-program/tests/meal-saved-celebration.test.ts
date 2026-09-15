import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  getMealSavedCelebrationMotion,
  getMealSavedProgress,
  mealSavedCelebrationMotion,
} from "../src/features/meals/meal-saved-celebration-motion";

const srcRoot = resolve(import.meta.dirname, "../src");
const componentPath = resolve(srcRoot, "components/meal-saved-celebration/index.tsx");
const stylesPath = resolve(srcRoot, "styles/page.scss");
const previewPath = resolve(srcRoot, "pages/meal-saved-preview/index.tsx");
const appConfigPath = resolve(srcRoot, "app.config.ts");
const layoutPath = resolve(srcRoot, "layouts/page-layout/index.tsx");

describe("meal saved celebration motion", () => {
  it("uses the achievement-unlock pace for both saved and updated meals", () => {
    expect(mealSavedCelebrationMotion.totalDurationMs).toBe(2300);
    expect(mealSavedCelebrationMotion.backdropDurationMs).toBe(300);
    expect(mealSavedCelebrationMotion.cardDelayMs).toBe(500);
    expect(mealSavedCelebrationMotion.cardDurationMs).toBe(600);
    expect(mealSavedCelebrationMotion.ringDurationMs).toBe(520);
    expect(mealSavedCelebrationMotion.checkDelayMs).toBe(1030);
    expect(mealSavedCelebrationMotion.checkDurationMs).toBe(260);
    expect(mealSavedCelebrationMotion.nutritionStartMs).toBe(1400);
    expect(mealSavedCelebrationMotion.nutritionStaggerMs).toBe(100);
    expect(mealSavedCelebrationMotion.progressStartMs).toBe(1800);
    expect(mealSavedCelebrationMotion.ctaStartMs).toBe(1900);
  });

  it("keeps nutrition chips in a stable two-by-two reading order", () => {
    const styles = readFileSync(stylesPath, "utf8");

    expect(styles).toContain("display: grid;");
    expect(styles).toContain("grid-template-columns: repeat(2, max-content);");
    expect(styles).toContain("justify-content: center;");
    expect(styles).toContain("width: auto;");
    expect(styles).toContain(".meal-saved-celebration__chip--1 { animation-delay: 1400ms; }");
    expect(styles).toContain(".meal-saved-celebration__chip--2 { animation-delay: 1500ms; }");
    expect(styles).toContain(".meal-saved-celebration__chip--3 { animation-delay: 1600ms; }");
    expect(styles).toContain(".meal-saved-celebration__chip--4 { animation-delay: 1700ms; }");
  });

  it("keeps the updated-meal celebration aligned with the saved-meal schedule", () => {
    const updatedMotion = getMealSavedCelebrationMotion("updated");
    const reusedMotion = getMealSavedCelebrationMotion("reused");

    expect(updatedMotion).toEqual(getMealSavedCelebrationMotion("created"));
    expect(reusedMotion).toEqual(getMealSavedCelebrationMotion("created"));

    const component = readFileSync(componentPath, "utf8");
    expect(component).toContain("const countDurationMs = 620;");
    expect(component).not.toContain('kind === "updated" ? 540 : 460');
  });

  it("animates today's progress from its pre-save value", () => {
    expect(
      getMealSavedProgress({ beforeCalories: 970, currentCalories: 1420, targetCalories: 2100 }),
    ).toEqual({ from: 46.19, to: 67.62 });
  });

  it("clamps invalid progress safely for the fixed scaleX track", () => {
    expect(getMealSavedProgress({ beforeCalories: -10, currentCalories: 3000, targetCalories: 0 })).toEqual({
      from: 0,
      to: 100,
    });
  });

  it("provides a standalone Taro overlay without a native Canvas layout layer", () => {
    expect(existsSync(componentPath)).toBe(true);
    const component = readFileSync(componentPath, "utf8");
    const styles = readFileSync(stylesPath, "utf8");

    expect(component).toContain("export interface MealSavedCelebrationProps");
    expect(component).toContain("meal-saved-celebration__success-ring");
    expect(component).toContain("meal-saved-celebration__ring-track");
    expect(component).not.toContain("meal-saved-celebration__ring-mask");
    expect(component).toContain("meal-saved-celebration__check-mark");
    expect(component).not.toContain("meal-saved-celebration__check-short");
    expect(component).not.toContain("meal-saved-celebration__check-long");
    expect(component).toContain("meal-saved-celebration__particle--1");
    expect(component).toContain("progressScale");
    expect(component).toContain("progressAnimating");
    expect(component).toContain("meal-saved-celebration__progress-fill--animating");
    expect(component).toContain("setProgressScale(to / 100)");
    expect(component).toContain("clearTimeout(progressTimer)");
    expect(component).toContain("setActionsReady(true)");
    expect(component).toContain("onViewMeal");
    expect(component).toContain("onContinue");
    expect(styles).toContain(".meal-saved-celebration__card");
    expect(component).toContain("scaleX(");
    expect(styles).toContain("transition: transform 720ms cubic-bezier(0.25, 1, 0.5, 1)");
    expect(styles).toContain("z-index: 280");
    expect(component).not.toContain("<MealSavedSuccessCanvas");
    expect(styles).toContain("scale(0.94)");
    expect(styles).toContain("translateY(28rpx)");
    expect(styles).toContain("position: absolute");
    expect(styles).toContain(".meal-saved-celebration__success-ring");
    expect(styles).toContain(".meal-saved-celebration__ring-track");
    expect(styles).toContain("meal-saved-ring-pop");
    expect(styles).toContain("height: 160rpx");
    expect(styles).toContain("left: 42rpx;");
    expect(styles).toContain("top: 34rpx;");
    expect(styles).toContain(".meal-saved-celebration__check-mark");
    expect(styles).toContain("border-bottom: 10rpx solid #2d4739;");
    expect(styles).toContain("border-left: 10rpx solid #2d4739;");
    expect(styles).toContain("animation: meal-saved-fade-up 420ms ease-out 1150ms both");
  });

  it("renders the Chinese saved-meal flow from the shared page layout", () => {
    const component = readFileSync(componentPath, "utf8");
    const layout = readFileSync(layoutPath, "utf8");

    expect(component).toContain("本餐已保存！");
    expect(component).toContain("本餐已更新！");
    expect(component).toContain("查看本餐");
    expect(component).toContain("继续记录");
    expect(component).toContain("回到主页");
    expect(component).toContain('kind === "reused"');
    expect(component).toContain("!isTemplate && (");
    expect(layout).toContain("useMealSavedCelebrationStore");
    expect(layout).toContain("MealSavedCelebration");
    expect(layout).toContain("savedMeal.mealId");
    expect(layout).toContain('Taro.switchTab({ url: "/pages/home/index" })');
    expect(layout).toContain('Taro.switchTab({ url: "/pages/meal-records/index" })');
    expect(layout).toContain('currentPage?.route === "pages/portion-adjustment/index"');
    expect(layout).toContain("Taro.navigateBack({ delta: 1 })");
    expect(layout).not.toContain('Taro.redirectTo({ url: `/pages/meal-detail/index?id=${savedMeal.mealId}` })');
    expect(layout).toContain("getCelebrationOverlayPriority");
    expect(layout).toContain('celebrationPriority === "meal-saved"');
    expect(layout).toContain('celebrationPriority === "achievement"');
    expect(layout).not.toContain('Taro.showToast({ title: "庆祝确认失败，请稍后重试", icon: "none" })');
  });

  it("removes the development-only replay surface after real-flow integration", () => {
    expect(existsSync(previewPath)).toBe(false);
    const appConfig = readFileSync(appConfigPath, "utf8");
    const styles = readFileSync(stylesPath, "utf8");

    expect(appConfig).not.toContain("meal-saved-preview");
    expect(styles).not.toContain(".meal-saved-preview-page");
  });
});
