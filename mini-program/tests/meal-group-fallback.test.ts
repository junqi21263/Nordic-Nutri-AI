import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { getFoodVisualFallback } from "../src/features/food-catalog/food-visuals";

const mealGroup = () =>
  readFileSync(resolve(import.meta.dirname, "../src/components/meal-group/index.tsx"), "utf8");

describe("meal group image fallback", () => {
  it("maps common manual meal names to category icons instead of a plus mark", () => {
    expect(getFoodVisualFallback({ description: "香蕉" })).toEqual({
      tone: "produce",
      icon: "food-apple",
    });
    expect(getFoodVisualFallback({ description: "鸡胸肉" }).icon).toBe("protein");
    expect(getFoodVisualFallback({ description: "番茄炒蛋" }).icon).toBe("food-egg");
    expect(getFoodVisualFallback({ description: "鱼香茄子" }).icon).toBe("food-carrot");
    expect(getFoodVisualFallback({ description: "随意加餐" }).icon).toBe("utensils");
  });

  it("renders category-aware NordicIcon fallbacks in meal rows", () => {
    const source = mealGroup();
    expect(source).toContain("getFoodVisualFallback");
    expect(source).toContain("NordicIcon");
    expect(source).toContain("meal-group__image--fallback");
    expect(source).not.toMatch(/\{thumb \? \([\s\S]*?\) : \(\s*<Text>＋<\/Text>\s*\)\}/);
  });
});
