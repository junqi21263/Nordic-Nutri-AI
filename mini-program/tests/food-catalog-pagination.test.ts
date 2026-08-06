import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  appendCatalogItems,
  canLoadMoreCatalogItems,
  pickRandomCatalogPage,
  shuffleCatalogItems,
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

  it("shuffles catalog items without dropping or duplicating foods", () => {
    const items = [food("a"), food("b"), food("c"), food("d")];
    const shuffled = shuffleCatalogItems(items, () => 0);
    expect(shuffled).toHaveLength(4);
    expect(new Set(shuffled.map((item) => item.id))).toEqual(new Set(["a", "b", "c", "d"]));
    expect(shuffled).not.toBe(items);
  });

  it("picks a random catalog page within the available range", () => {
    expect(pickRandomCatalogPage(undefined, () => 0.9)).toBe(1);
    expect(pickRandomCatalogPage({ page: 1, pageSize: 20, total: 20, hasMore: false }, () => 0.9)).toBe(1);
    expect(pickRandomCatalogPage({ page: 1, pageSize: 20, total: 55, hasMore: true }, () => 0)).toBe(1);
    expect(pickRandomCatalogPage({ page: 1, pageSize: 20, total: 55, hasMore: true }, () => 0.99)).toBe(3);
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

  it("removes recent records and places sticky tags before the result list", () => {
    const page = readFileSync(resolve(sourceRoot, "pages/food-catalog/index.tsx"), "utf8");
    const styles = readFileSync(resolve(sourceRoot, "styles/page.scss"), "utf8");
    const recentIndex = page.indexOf("最近记录");
    const tagsIndex = page.indexOf('food-catalog-rail--tags');
    const resultsIndex = page.indexOf('food-catalog-section__title');

    expect(recentIndex).toBe(-1);
    expect(page).not.toContain("recentFoods");
    expect(page).not.toContain("addRecentFood");
    expect(tagsIndex).toBeGreaterThan(-1);
    expect(tagsIndex).toBeLessThan(resultsIndex);
    expect(styles).toContain("position: sticky;");
    expect(styles).toContain("top: var(--app-header-height, 0px);");
  });

  it("keeps all, Nordic, and North American category chips in the catalog", () => {
    const page = readFileSync(resolve(sourceRoot, "pages/food-catalog/index.tsx"), "utf8");
    expect(page).toContain('label: "全部"');
    expect(page).toContain('code: "nordic_staples"');
    expect(page).toContain('code: "north_american_staples"');
    expect(page).toContain("activeCategoryCodes");
    expect(page).toContain("selectedTagCodes");
    expect(page).toContain("loadMoreLockRef");
  });

  it("supports paginated discovery responses for the all category", () => {
    const api = readFileSync(resolve(sourceRoot, "api/food-catalog-api.ts"), "utf8");
    expect(api).toContain("pagination?: { page: number; pageSize: number; total: number; hasMore: boolean }");
    expect(api).toContain("page = 1");
    expect(api).toContain("new URLSearchParams({ page: String(page) })");
    expect(api).toContain("/foods/discover?${params.toString()}");
  });

  it("uses food-name wording and only marks text searches as search results", () => {
    const page = readFileSync(resolve(sourceRoot, "pages/food-catalog/index.tsx"), "utf8");

    expect(page).toContain('placeholder="搜索食物名称"');
    expect(page).not.toContain("搜索食物或扫码");
    expect(page).toContain('setHasSearched(searchQuery.trim().length > 0)');
  });

  it("keeps the sticky tag rail opaque and clipped over scrolling content", () => {
    const styles = readFileSync(resolve(sourceRoot, "styles/page.scss"), "utf8");
    const tagRail = styles.match(/\.food-catalog-rail--tags\s*\{[^}]*\}/s)?.[0] ?? "";

    expect(tagRail).toContain("background: $color-background;");
    expect(tagRail).toContain("overflow: hidden;");
    expect(tagRail).toContain("position: sticky;");
  });

  it("shows an explicit loading state while the catalog is reloading after detail return", () => {
    const page = readFileSync(resolve(sourceRoot, "pages/food-catalog/index.tsx"), "utf8");

    expect(page).toContain('import { LoadingState } from "../../components/loading-state";');
    expect(page).toContain("const [isPageLoading, setIsPageLoading] = useState(true);");
    expect(page).toContain("if (replace) setIsPageLoading(true);");
    expect(page).toContain("{isPageLoading ? <LoadingState");
  });
});
