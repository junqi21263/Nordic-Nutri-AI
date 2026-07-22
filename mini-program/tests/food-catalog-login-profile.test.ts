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
    expect(tabBar).toContain('Taro.navigateTo({ url: route })');
  });

  it("loads a fresh discovery list on food catalog entry and preserves selected food images", () => {
    const page = readFileSync(resolve(sourceRoot, "pages/food-catalog/index.tsx"), "utf8");
    const manualMeal = readFileSync(resolve(sourceRoot, "pages/manual-meal/index.tsx"), "utf8");

    expect(page).toContain("discoverProductFoodCatalog");
    expect(page).toContain("useDidShow(() => { void discover(); })");
    expect(manualMeal).toContain("selectedFood.imageUrl");
  });

  it("requests the WeChat profile from the login tap and syncs nickname plus avatar after login", () => {
    const page = readFileSync(resolve(sourceRoot, "pages/auth-entry/index.tsx"), "utf8");

    expect(page).toContain("Taro.getUserProfile");
    expect(page).toContain("saveProductProfile");
    expect(page).toContain("uploadProfileAvatar");
    expect(page).toContain("Taro.downloadFile");
  });
});
