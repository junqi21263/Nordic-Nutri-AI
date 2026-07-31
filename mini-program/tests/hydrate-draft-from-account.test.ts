import { describe, expect, it } from "vitest";
import type { ProductAccount } from "../src/api/product-data-api";
import {
  draftPatchFromAccount,
  isSettingsEditMode,
  settingsEntryQuery,
  settingsQuery,
  shouldHydrateFromAccount,
} from "../src/features/onboarding/hydrate-draft-from-account";

function sampleAccount(overrides: Partial<ProductAccount> = {}): ProductAccount {
  return {
    nickname: "Nova",
    avatarUrl: null,
    age: 28,
    sex: "female",
    heightCm: 165,
    weightKg: 58,
    activityLevel: "moderate",
    trainingDays: 4,
    goalType: "maintain",
    targetWeightKg: 56,
    targetCaloriesKcal: 1900,
    settings: {
      dietaryPattern: "vegetarian",
      foodAvoidances: ["dairy", "nuts"],
      mealsPerDay: 4,
      theme: "system",
      language: "zh-CN",
      notification: true,
      unit: "metric",
    },
    nutritionPlan: null,
    ...overrides,
  };
}

describe("hydrate draft from account", () => {
  it("maps account goal maintain to draft maintenance and stringifies body fields", () => {
    const patch = draftPatchFromAccount(sampleAccount());

    expect(patch.nickname).toBe("Nova");
    expect(patch.goalType).toBe("maintenance");
    expect(patch.age).toBe("28");
    expect(patch.gender).toBe("female");
    expect(patch.heightCm).toBe("165");
    expect(patch.weightKg).toBe("58");
    expect(patch.activityLevel).toBe("moderate");
    expect(patch.trainingDays).toBe("4");
    expect(patch.targetWeightKg).toBe("56");
    expect(patch.dietaryPattern).toBe("vegetarian");
    expect(patch.foodAvoidances).toEqual(["dairy", "nuts"]);
    expect(patch.mealsPerDay).toBe("4");
  });

  it("falls back very_high activity to high and clamps unknown meal counts", () => {
    const patch = draftPatchFromAccount(
      sampleAccount({
        activityLevel: "very_high",
        settings: {
          dietaryPattern: null,
          foodAvoidances: [],
          mealsPerDay: 9,
          theme: "system",
          language: "zh-CN",
          notification: true,
          unit: "metric",
        },
      }),
    );

    expect(patch.activityLevel).toBe("high");
    expect(patch.mealsPerDay).toBe("3");
    expect(patch.dietaryPattern).toBe("none");
  });

  it("detects settings edit mode and hydrates only on profile entry", () => {
    expect(isSettingsEditMode({ from: "settings" })).toBe(true);
    expect(isSettingsEditMode({ from: "onboarding" })).toBe(false);
    expect(shouldHydrateFromAccount({ from: "settings", entry: "1" })).toBe(true);
    expect(shouldHydrateFromAccount({ from: "settings" })).toBe(false);
    expect(settingsQuery(true)).toBe("?from=settings");
    expect(settingsQuery(false)).toBe("");
    expect(settingsEntryQuery()).toBe("?from=settings&entry=1");
  });
});
