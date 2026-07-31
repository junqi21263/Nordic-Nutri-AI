import type { ProductAccount } from "../../api/product-data-api";
import type {
  ActivityLevel,
  DietaryPattern,
  FoodAvoidance,
  GoalType,
  OnboardingDraft,
} from "./domain";

const goalTypeFromAccount: Record<
  NonNullable<ProductAccount["goalType"]>,
  GoalType
> = {
  muscle_gain: "muscle_gain",
  fat_loss: "fat_loss",
  maintain: "maintenance",
  performance: "performance",
};

const mealCountValues = new Set(["2", "3", "4", "5"]);

function asActivityLevel(value: ProductAccount["activityLevel"]): ActivityLevel | null {
  if (value === "sedentary" || value === "light" || value === "moderate" || value === "high") {
    return value;
  }
  if (value === "very_high") return "high";
  return null;
}

function asMealsPerDay(value: number | null | undefined): OnboardingDraft["mealsPerDay"] {
  const key = String(value ?? 3);
  return (mealCountValues.has(key) ? key : "3") as OnboardingDraft["mealsPerDay"];
}

/** Map cloud account fields into the onboarding draft used by edit/settings flows. */
export function draftPatchFromAccount(account: ProductAccount): Partial<OnboardingDraft> {
  const settings = account.settings;
  return {
    nickname: account.nickname?.trim() || "",
    goalType: account.goalType ? goalTypeFromAccount[account.goalType] : null,
    age: account.age != null ? String(account.age) : "",
    gender: account.sex === "male" || account.sex === "female" ? account.sex : null,
    heightCm: account.heightCm != null ? String(account.heightCm) : "",
    weightKg: account.weightKg != null ? String(account.weightKg) : "",
    activityLevel: asActivityLevel(account.activityLevel),
    trainingDays: account.trainingDays != null ? String(account.trainingDays) : "",
    targetWeightKg: account.targetWeightKg != null ? String(account.targetWeightKg) : "",
    dietaryPattern: (settings?.dietaryPattern as DietaryPattern | null) || "none",
    foodAvoidances: Array.isArray(settings?.foodAvoidances)
      ? (settings.foodAvoidances as FoodAvoidance[])
      : [],
    mealsPerDay: asMealsPerDay(settings?.mealsPerDay),
  };
}

export function isSettingsEditMode(params?: Record<string, string | undefined>) {
  return params?.from === "settings";
}

/** True only when opening from Profile as the entry page (not mid-chain). */
export function shouldHydrateFromAccount(params?: Record<string, string | undefined>) {
  return isSettingsEditMode(params) && params?.entry === "1";
}

export function settingsQuery(fromSettings: boolean) {
  return fromSettings ? "?from=settings" : "";
}

export function settingsEntryQuery() {
  return "?from=settings&entry=1";
}
