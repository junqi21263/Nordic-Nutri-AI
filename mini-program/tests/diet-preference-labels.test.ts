import { describe, expect, it } from "vitest";
import {
  dietaryPatternLabel,
  foodAvoidanceLabel,
  formatDietPreferencesSummary,
  formulaPlanInsight,
} from "../src/features/onboarding/diet-preference-labels";
import {
  calculateNutritionPlan,
  createInitialOnboardingDraft,
  validateBodyProfile,
} from "../src/features/onboarding/domain";

const validDraft = {
  ...createInitialOnboardingDraft(),
  nickname: "Nova",
  goalType: "maintenance" as const,
  age: "28",
  gender: "female" as const,
  heightCm: "165",
  weightKg: "58",
  activityLevel: "moderate" as const,
  trainingDays: "4",
};

describe("diet preference labels", () => {
  it("maps codes to Chinese labels and builds a profile summary", () => {
    expect(dietaryPatternLabel("vegetarian")).toBe("素食为主");
    expect(foodAvoidanceLabel("spicy")).toBe("辛辣食物");
    expect(
      formatDietPreferencesSummary({
        dietaryPattern: "vegetarian",
        foodAvoidances: ["spicy", "dairy"],
        mealsPerDay: 4,
      }),
    ).toBe("素食为主 · 忌辛辣食物、乳制品 · 4 餐/天");
  });

  it("keeps formula insight within 40 Chinese characters", () => {
    const insight = formulaPlanInsight({
      dietaryPattern: "keto",
      foodAvoidances: ["nuts"],
      mealsPerDay: 3,
    });
    expect(insight.length).toBeLessThanOrEqual(40);
    expect(insight).toContain("生酮");
  });
});

describe("calculateNutritionPlan diet prefs", () => {
  it("shifts macros for low_carb versus balanced defaults", () => {
    const profile = validateBodyProfile(validDraft, "2026-07-13").profile!;
    const balanced = calculateNutritionPlan(profile, { dietaryPattern: "none" });
    const lowCarb = calculateNutritionPlan(profile, { dietaryPattern: "low_carb" });
    expect(lowCarb.calories).toBe(balanced.calories);
    expect(lowCarb.carbsG).toBeLessThan(balanced.carbsG);
    expect(lowCarb.fatG).toBeGreaterThan(balanced.fatG);
  });
});
