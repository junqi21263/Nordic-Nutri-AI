import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourceRoot = resolve(import.meta.dirname, "../src");

describe("product data HTTPS boundary", () => {
  it("saves profile, onboarding body data, and goals through the product HTTPS client instead of Supabase", () => {
    for (const page of [
      "pages/profile-edit/index.tsx",
      "pages/body-profile/index.tsx",
      "pages/goal-adjust/index.tsx",
      "pages/nutrition-plan/index.tsx",
    ]) {
      const source = readFileSync(resolve(sourceRoot, page), "utf8");
      expect(source).toContain("product-data-api");
      expect(source).not.toContain("getSupabaseClient");
      expect(source).not.toContain("selectRuntimeAdapter");
    }
    const plan = readFileSync(resolve(sourceRoot, "pages/nutrition-plan/index.tsx"), "utf8");
    expect(plan).toContain("completeProductOnboarding");
    expect(plan).toContain("previewProductNutritionPlan");
    expect(plan).toContain("macroEnergyPercents");
    expect(plan).not.toContain("completeSupabaseOnboarding");
    expect(plan).not.toContain("plan.proteinG * 3");
  });

  it("loads and updates settings and the active nutrition plan through the same HTTPS boundary", () => {
    const api = readFileSync(resolve(sourceRoot, "api/product-data-api.ts"), "utf8");
    const bootstrap = readFileSync(resolve(sourceRoot, "auth/app-auth-bootstrap.ts"), "utf8");
    expect(api).toContain("saveProductSettings");
    expect(api).toContain("getProductNutritionPlan");
    expect(api).toContain("saveProductNutritionPlan");
    expect(api).toContain("previewProductNutritionPlan");
    expect(api).toContain('method: "PATCH"');
    expect(bootstrap).toContain("account.settings");
    expect(bootstrap).toContain("account.nutritionPlan");
  });
});
