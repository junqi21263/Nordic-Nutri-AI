import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const manualMealPage = readFileSync(resolve(import.meta.dirname, "../src/pages/manual-meal/index.tsx"), "utf8");
const foodDetailPage = readFileSync(resolve(import.meta.dirname, "../src/pages/food-detail/index.tsx"), "utf8");

describe("manual meal and food detail image layout", () => {
  it("removes duplicate manual meal title and catalog entry while preserving selected food", () => {
    expect(manualMealPage).not.toContain("补充这一餐");
    expect(manualMealPage).not.toContain("manual-meal__catalog-link");
    expect(manualMealPage).toContain("manual-meal__selected-food");
    expect(manualMealPage).toContain("consumeSelectedFood");
  });

  it("renders the food detail image after identity and before portion selection", () => {
    const identityIndex = foodDetailPage.indexOf('className="food-detail-page__identity');
    const heroIndex = foodDetailPage.indexOf('className="food-detail-page__hero food-detail-page__hero--wide"');
    const portionIndex = foodDetailPage.indexOf('className="food-detail-page__portion"');

    expect(foodDetailPage).toContain('prefer="detail"');
    expect(identityIndex).toBeGreaterThanOrEqual(0);
    expect(heroIndex).toBeGreaterThan(identityIndex);
    expect(portionIndex).toBeGreaterThan(heroIndex);
  });
});
