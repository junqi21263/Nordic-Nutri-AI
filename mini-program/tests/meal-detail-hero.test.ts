import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hasValidMealImage } from "../src/components/meal-detail-hero/logic";

const sourceRoot = resolve(process.cwd(), "src");
const read = (path: string) => readFileSync(resolve(sourceRoot, path), "utf8");

describe("MealDetailHero", () => {
  it("仅将有效的真实图片地址识别为 Photo Hero", () => {
    expect(hasValidMealImage("https://example.com/meal.jpg")).toBe(true);
    expect(hasValidMealImage("cloud://env-id.bucket/meal.jpg")).toBe(true);
    expect(hasValidMealImage("wxfile://tmp/meal.jpg")).toBe(true);
    expect(hasValidMealImage(null)).toBe(false);
    expect(hasValidMealImage("  ")).toBe(false);
    expect(hasValidMealImage("/assets/meal-bowl.svg")).toBe(false);
    expect(hasValidMealImage("https://example.com/default-meal.png")).toBe(false);
    expect(hasValidMealImage("https://example.com/placeholder.png")).toBe(false);
  });

  it("将无图片状态呈现为柔和、无分割线且以中文热量为主视觉的数据摘要", () => {
    const hero = read("components/meal-detail-hero/index.tsx");
    const styles = read("styles/page.scss");

    expect(hero).toContain("meal-detail-page__data-hero-arc");
    expect(hero).toContain(">千卡<");
    expect(hero).toContain("meal-detail-page__hero-macro-dot");
    expect(hero).toContain("<HeroMacros nutrition={nutrition} dataPoint />");
    expect(styles).toContain(".meal-detail-page__data-hero-arc");
    expect(styles).toContain(".meal-detail-page__hero--data .meal-detail-page__hero-macro-dot");
    expect(styles).toContain("flex-direction: column;");
    expect(styles).toContain("font-size: 46px;");
    expect(styles).toContain("font-size: 18px;");
    expect(styles).toContain("font-size: 32px;");
    expect(styles).not.toContain("border-left: 1px solid rgba($color-forest-green, 0.16)");
  });
});
