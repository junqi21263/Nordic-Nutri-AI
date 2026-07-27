import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(import.meta.dirname, "../src");

describe("food catalog discovery and login profile sync", () => {
  it("renders all six tabs as primary pages, with food-scanner using navigateTo", () => {
    const config = readFileSync(resolve(sourceRoot, "app.config.ts"), "utf8");
    const tabBar = readFileSync(resolve(sourceRoot, "components/bottom-tab-bar/index.tsx"), "utf8");

    expect(config).toContain('{ pagePath: "pages/coach/index", text: "教练" }');
    expect(config).toContain('{ pagePath: "pages/meal-records/index", text: "记录" }');
    expect(config).not.toContain('{ pagePath: "pages/food-scanner/index", text: "扫描" }');
    expect(tabBar).toContain('{ key: "food-catalog", label: "食物库", icon: "utensils" }');
    expect(tabBar).toContain('if (key === "food-scanner")');
    expect(tabBar).toContain("Taro.navigateTo({ url: route })");
  });

  it("loads a fresh discovery list on food catalog entry and renders a resilient food image", () => {
    const page = readFileSync(resolve(sourceRoot, "pages/food-catalog/index.tsx"), "utf8");
    const manualMeal = readFileSync(resolve(sourceRoot, "pages/manual-meal/index.tsx"), "utf8");
    const detail = readFileSync(resolve(sourceRoot, "pages/food-detail/index.tsx"), "utf8");
    const labels = readFileSync(
      resolve(sourceRoot, "features/food-catalog/food-labels.ts"),
      "utf8",
    );
    const api = readFileSync(resolve(sourceRoot, "api/food-catalog-api.ts"), "utf8");
    const appConfig = readFileSync(resolve(sourceRoot, "app.config.ts"), "utf8");

    expect(page).toContain("discoverProductFoodCatalog");
    expect(page).toContain("getProductFoodCategories");
    expect(page).toContain("getProductFoodTags");
    expect(page).toContain("getProductFoodSuggestions");
    expect(page).toContain("resolveCategorySearchQuery");
    expect(page).toContain("searchProductFoodCatalog");
    expect(page).toMatch(/useDidShow\(\(\) => \{\s*void discover\(\);\s*void loadTaxonomy\(\);\s*\}\);/);
    expect(page).toContain("热门推荐");
    expect(page).toContain("最近记录");
    expect(manualMeal).toContain("FoodThumbnail");
    expect(page).toContain("pages/food-detail/index");
    expect(page).toContain("FoodThumbnail");
    expect(detail).toContain("FoodThumbnail");
    expect(detail).toContain("份量选择");
    expect(detail).toContain("Lagom AI");
    expect(labels).toContain("高蛋白");
    expect(api).toContain("getProductFoodCategories");
    expect(api).toContain("getProductFoodByBarcode");
    expect(appConfig).toContain('"pages/food-detail/index"');
  });

  it("keeps bootstrap robot avatar and only syncs a real WeChat nickname on login", () => {
    const page = readFileSync(resolve(sourceRoot, "pages/auth-entry/index.tsx"), "utf8");
    const profileEdit = readFileSync(resolve(sourceRoot, "pages/profile-edit/index.tsx"), "utf8");

    expect(page).toContain("微信一键登录");
    expect(page).toContain("saveProductProfile");
    expect(page).toContain("useProfileStore.getState().setProfile");
    expect(page).toContain("默认头像与昵称会自动生成");
    expect(page).not.toContain("uploadProfileAvatar");
    expect(profileEdit).toContain("uploadProfileAvatar");
    expect(profileEdit).toContain("openType=\"chooseAvatar\"");
  });
});
