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

  it("cancels a product account through the authenticated HTTPS API after two local confirmations", () => {
    const api = readFileSync(resolve(sourceRoot, "api/product-data-api.ts"), "utf8");
    const page = readFileSync(resolve(sourceRoot, "pages/account-cancellation/index.tsx"), "utf8");
    const policy = readFileSync(resolve(sourceRoot, "pages/privacy-policy/index.tsx"), "utf8");
    const authApi = readFileSync(resolve(sourceRoot, "api/auth-api.ts"), "utf8");
    const client = readFileSync(resolve(sourceRoot, "api/product-api-client.ts"), "utf8");

    expect(api).toContain("cancelProductAccount");
    expect(api).toContain('"/account/cancel"');
    expect(api).toContain('method: "POST"');
    expect(api).toContain("clientRequestId");
    expect(page).toContain("cancelProductAccount");
    expect(page).toContain("clearProductLocalState");
    expect(api).toContain("DELETE_MY_NORDIC_NUTRI_ACCOUNT");
    expect(page).toContain("/pages/auth-entry/index");
    expect(page).toContain("确认注销并删除数据");
    expect(policy).toContain("/pages/account-cancellation/index");
    expect(authApi).toContain("syncOnboardingCompletedFromServer");
    expect(client).toContain("SESSION_USER_MISSING");
    expect(client).toContain("clearInvalidSession");
    expect(client).toContain("clearProductLocalState");
    const bootstrap = readFileSync(resolve(sourceRoot, "auth/app-auth-bootstrap.ts"), "utf8");
    expect(bootstrap).toContain("syncOnboardingCompletedFromAccount");
    expect(page).toContain("clearProductLocalState");
  });
});
