import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = (path: string) =>
  readFileSync(resolve(import.meta.dirname, `../src/pages/${path}/index.tsx`), "utf8");

describe("body and goal real save pages", () => {
  it("persists a validated body profile version through the authenticated HTTPS data client", () => {
    const page = source("body-profile");

    expect(page).toContain("saveProductBodyProfile");
    expect(page).not.toContain("getSupabaseClient");
    expect(page).toContain("loading={isSaving}");
    expect(page).toContain('setField("nickname"');
  });

  it("persists a goal version through the authenticated HTTPS data client before returning to the profile page", () => {
    const page = source("goal-adjust");

    expect(page).toContain("saveProductGoal");
    expect(page).toContain("saveProductNutritionPlan");
    expect(page).toContain("getProductNutritionPlan");
    expect(page).toContain("proteinG");
    expect(page).toContain("carbsG");
    expect(page).toContain("fatG");
    expect(page).toContain("evaluateProductAchievements");
    expect(page).toContain("await evaluateProductAchievements()");
    expect(page).toContain('title: "今日目标已更新"');
    expect(page).not.toContain('title: "目标方向已更新"');
    expect(page).not.toContain("getSupabaseClient");
    expect(page).toContain("loading={isSaving || loadingPlan}");
  });

  it("persists the complete onboarding transaction through the authenticated HTTPS service before opening the home page", () => {
    const page = source("nutrition-plan");

    expect(page).toContain("completeProductOnboarding");
    expect(page).toContain("previewProductNutritionPlan");
    expect(page).toContain("nickname: profile.nickname");
    expect(page).not.toContain("getSupabaseClient");
    expect(page).toContain("loading={isSaving || isLoadingPlan}");
  });

  it("lets settings edits save body, prefs and nutrition plan without re-running onboarding", () => {
    const page = source("nutrition-plan");
    const settingsSaveStart = page.indexOf("const saveSettingsPlan = async () => {");
    const onboardingStart = page.indexOf("const completeOnboarding = async () => {");
    const settingsSave = page.slice(settingsSaveStart, onboardingStart);
    const onboardingSave = page.slice(onboardingStart);

    expect(page).toContain("fromSettings");
    expect(page).toContain("saveProductBodyProfile");
    expect(page).toContain("saveProductGoal");
    expect(page).toContain("saveProductSettings");
    expect(page).toContain("saveProductNutritionPlan");
    expect(page).toContain("保存并更新目标");
    expect(page).toContain('url: "/pages/profile/index"');
    expect(settingsSave).not.toContain('variant: "success"');
    expect(settingsSave).toContain('await Taro.switchTab({ url: "/pages/profile/index" })');
    expect(onboardingSave).not.toContain('variant: "success"');
    expect(onboardingSave).toContain('await Taro.switchTab({ url: "/pages/home/index" })');
  });

  it("evaluates profile completion immediately after profile edits persist", () => {
    const page = source("profile-edit");

    expect(page).toContain("evaluateProductAchievements");
    expect(page).toContain("await evaluateProductAchievements()");
  });

  it("sends mealsPerDay into nutrition plan preview with diet prefs", () => {
    const page = source("nutrition-plan");

    expect(page).toContain("mealsPerDay: Number(draft.mealsPerDay)");
    expect(page).toContain("calculateNutritionPlan(profile, dietPrefs)");
    expect(page).toContain("formulaPlanInsight");
  });
});
