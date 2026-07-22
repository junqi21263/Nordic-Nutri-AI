import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(import.meta.dirname, "../src");

describe("food catalog discovery and login profile sync", () => {
  it("keeps the native tab list within WeChat's five-tab limit and opens the catalog from the custom bar", () => {
    const config = readFileSync(resolve(sourceRoot, "app.config.ts"), "utf8");
    const tabBar = readFileSync(resolve(sourceRoot, "components/bottom-tab-bar/index.tsx"), "utf8");

    expect(config).not.toContain('{ pagePath: "pages/food-catalog/index", text: "食物库" }');
    expect(tabBar).toContain('{ key: "food-catalog", label: "食物库", icon: "utensils" }');
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
    const appConfig = readFileSync(resolve(sourceRoot, "app.config.ts"), "utf8");

    expect(page).toContain("discoverProductFoodCatalog");
    expect(page).toMatch(/useDidShow\(\(\) => \{\s*void discover\(\);\s*\}\);/);
    expect(manualMeal).toContain("FoodThumbnail");
    expect(page).toContain("pages/food-detail/index");
    expect(page).toContain("FoodThumbnail");
    expect(detail).toContain("FoodThumbnail");
    expect(page).toContain("getFoodCategory");
    expect(page).toContain("getFoodTags");
    expect(page).toContain("categoryFilter");
    expect(page).toContain("tagFilter");
    expect(detail).toContain("知道了");
    expect(detail).toContain("添加到本餐");
    expect(labels).toContain("高蛋白");
    expect(appConfig).toContain('"pages/food-detail/index"');
  });

  it("requests the WeChat profile from the login tap and surfaces profile-sync failures", () => {
    const page = readFileSync(resolve(sourceRoot, "pages/auth-entry/index.tsx"), "utf8");

    expect(page).toContain("Taro.getUserProfile");
    expect(page).toContain("saveProductProfile");
    expect(page).toContain("uploadProfileAvatar");
    expect(page).toContain("Taro.downloadFile");
    expect(page).toContain("useProfileStore.getState().setProfile");
    expect(page).toContain("profileWarning");
    expect(page).not.toContain("syncWechatProfile(wechatProfile).catch");
  });
});
