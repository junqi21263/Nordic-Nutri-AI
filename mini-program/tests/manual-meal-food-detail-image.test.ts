import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const manualMealPage = readFileSync(resolve(import.meta.dirname, "../src/pages/manual-meal/index.tsx"), "utf8");
const foodDetailPage = readFileSync(resolve(import.meta.dirname, "../src/pages/food-detail/index.tsx"), "utf8");
const foodThumbnail = readFileSync(resolve(import.meta.dirname, "../src/components/food-thumbnail/index.tsx"), "utf8");
const pageStyles = readFileSync(resolve(import.meta.dirname, "../src/styles/page.scss"), "utf8");

describe("manual meal and food detail image layout", () => {
  it("removes duplicate manual meal title and catalog entry while preserving selected food", () => {
    expect(manualMealPage).not.toContain("补充这一餐");
    expect(manualMealPage).not.toContain("manual-meal__catalog-link");
    expect(manualMealPage).toContain("manual-meal__selected-food");
    expect(manualMealPage).toContain("consumeSelectedFood");
  });

  it("renders the food detail image after identity and before portion selection", () => {
    const identityIndex = foodDetailPage.indexOf('className="food-detail-page__identity');
    const heroIndex = foodDetailPage.indexOf('className="food-detail-page__hero food-detail-page__hero--square"');
    const portionIndex = foodDetailPage.indexOf('className="food-detail-page__portion"');

    expect(foodDetailPage).toContain('prefer="detail"');
    expect(identityIndex).toBeGreaterThanOrEqual(0);
    expect(heroIndex).toBeGreaterThan(identityIndex);
    expect(portionIndex).toBeGreaterThan(heroIndex);
  });

  it("uses a compact food identity row without duplicate title, source text, or input underline", () => {
    expect(foodDetailPage).not.toContain('className="food-detail-page__title-row"');
    expect(foodDetailPage).not.toContain('className="food-detail-page__source"');
    expect(foodDetailPage).toContain('className="food-detail-page__name-row"');
    expect(foodDetailPage).toContain('className="food-detail-page__calories-inline"');
    expect(foodDetailPage).toContain("kcal/100g");
    expect(pageStyles).not.toMatch(
      /\.food-detail-page__portion-input input\s*\{[^}]*border-bottom\s*:/s,
    );
  });

  it("keeps the detail image square by default while allowing future source ratios", () => {
    expect(foodDetailPage).toContain('className="food-detail-page__hero food-detail-page__hero--square"');
    expect(foodDetailPage).toContain('prefer="detail"');
    expect(foodThumbnail).toContain("getFoodVisualAspectRatio");
    expect(foodThumbnail).toContain("aspectRatio");
    expect(pageStyles).not.toContain("aspect-ratio: 16 / 9");
    expect(pageStyles).toContain("aspect-ratio: 1 / 1");
  });
});
