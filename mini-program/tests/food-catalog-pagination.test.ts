import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendCatalogItems,
  canLoadMoreCatalogItems,
} from "../src/features/food-catalog/catalog-pagination";
import type { ProductFoodCatalogItem } from "../src/api/food-catalog-api";

const sourceRoot = resolve(import.meta.dirname, "../src");

function food(id: string): ProductFoodCatalogItem {
  return {
    id,
    source: "standard_food_v1",
    sourceFoodId: id,
    description: id,
    brandName: null,
    dataType: null,
    category: null,
    servingSize: null,
    servingUnit: null,
    caloriesKcalPer100g: null,
    proteinGPer100g: null,
    carbsGPer100g: null,
    fatGPer100g: null,
    imageUrl: null,
    image: null,
    sourceUrl: null,
  };
}

describe("food catalog pagination and category presentation", () => {
  it("appends the next page without duplicating foods", () => {
    expect(appendCatalogItems([food("a"), food("b")], [food("b"), food("c")])).toEqual([
      food("a"),
      food("b"),
      food("c"),
    ]);
  });

  it("only loads a next page while the server reports more data", () => {
    expect(canLoadMoreCatalogItems({ page: 1, pageSize: 20, total: 40, hasMore: true }, false)).toBe(true);
    expect(canLoadMoreCatalogItems({ page: 2, pageSize: 20, total: 40, hasMore: false }, false)).toBe(false);
    expect(canLoadMoreCatalogItems({ page: 1, pageSize: 20, total: 40, hasMore: true }, true)).toBe(false);
  });

  it("uses an outline selected state and keeps category labels readable", () => {
    const page = readFileSync(resolve(sourceRoot, "pages/food-catalog/index.tsx"), "utf8");
    const styles = readFileSync(resolve(sourceRoot, "styles/page.scss"), "utf8");

    expect(page).toContain("useReachBottom");
    expect(page).toContain("appendCatalogItems");
    expect(page).toContain("canLoadMoreCatalogItems");
    expect(styles).toContain(".food-catalog-category__icon--active");
    expect(styles).toContain("border-color: $color-forest-green;");
    expect(styles).toContain("white-space: normal;");
    expect(styles).toContain("word-break: break-all;");
    expect(styles).toContain(".food-catalog-popular-card__add");
    expect(styles).toContain("border: 1px solid rgba($color-forest-green, 0.32);");
    expect(styles).not.toMatch(
      /\.food-catalog-category__icon--active\s*\{[^}]*background:\s*\$color-primary-container;/s,
    );
    expect(styles).not.toMatch(
      /\.food-catalog-popular-card__add\s*\{[^}]*background:\s*\$color-forest-green;/s,
    );
  });
});
