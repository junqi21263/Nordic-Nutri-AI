import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(import.meta.dirname, "../src");
const read = (path: string) => readFileSync(resolve(sourceRoot, path), "utf8");

describe("meal type selection", () => {
  it("defaults scan and manual meals from local time, and lets analysis result change the type", () => {
    const vision = read("api/vision-api.ts");
    const manual = read("pages/manual-meal/index.tsx");
    const analysis = read("pages/analysis-result/index.tsx");

    expect(vision).toContain("inferMealTypeFromTime()");
    expect(vision).not.toContain("mealType: result.mealType");
    expect(manual).toContain("inferMealTypeFromTime()");
    expect(manual).not.toContain('useState<MealType>("snack")');
    expect(analysis).toContain("mealTypeOptions.map");
    expect(analysis).toContain("setMealType(option.value)");
    expect(analysis).toContain("这是哪一餐？");
    expect(analysis).not.toContain("mealTypeLabels[meal.mealType]");
  });
});
