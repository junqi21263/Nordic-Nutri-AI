import { describe, expect, it } from "vitest";
import {
  calculateNutritionPlan,
  createInitialOnboardingDraft,
  macroEnergyPercents,
  normalizeAgeInput,
  normalizeOneDecimalInput,
  type OnboardingDraft,
  validateBodyProfile,
  validateGoal,
} from "../src/features/onboarding/domain";
import { createOnboardingDraftStore } from "../src/stores/onboarding-draft-state";

const validDraft = {
  nickname: "Lewis",
  goalType: "muscle_gain" as const,
  age: "28",
  gender: "male" as const,
  heightCm: "175",
  weightKg: "70",
  activityLevel: "moderate" as const,
  trainingDays: "4",
  targetWeightKg: "",
  targetDate: "",
};

describe("first-use onboarding domain", () => {
  it("requires a nickname while keeping the target weight optional", () => {
    expect(createInitialOnboardingDraft()).toMatchObject({ nickname: "", targetWeightKg: "" });
    expect(
      validateBodyProfile({ ...validDraft, nickname: "   " }, "2026-07-13").errors.nickname,
    ).toBe("请输入昵称");
    expect(validateBodyProfile(validDraft, "2026-07-13").valid).toBe(true);
  });

  it("does not permit continuing without a goal", () => {
    expect(validateGoal(null)).toBe("请选择你的目标");
    expect(validateGoal("muscle_gain")).toBeUndefined();
  });

  it("retains a selected goal when returning to the draft", () => {
    const store = createOnboardingDraftStore();
    store.getState().setField("goalType", "fat_loss");
    store.getState().setField("age", "28");
    expect(store.getState().draft.goalType).toBe("fat_loss");
  });

  it.each([
    ["age", "13", "年龄需在 14–80 岁之间"],
    ["age", "81", "年龄需在 14–80 岁之间"],
    ["heightCm", "119", "身高需在 120–230 cm 之间"],
    ["heightCm", "231", "身高需在 120–230 cm 之间"],
    ["weightKg", "29", "体重需在 30–300 kg 之间"],
    ["weightKg", "301", "体重需在 30–300 kg 之间"],
    ["trainingDays", "8", "训练频率需在 0–7 天之间"],
  ] as const)("validates %s boundary", (field, value, message) => {
    const result = validateBodyProfile({ ...validDraft, [field]: value }, "2026-07-13");
    expect(result.errors[field]).toBe(message);
  });

  it("keeps age integral while limiting height and weight to one decimal place", () => {
    expect(normalizeAgeInput("28.6")).toBe("28");
    expect(normalizeAgeInput("2a8")).toBe("28");
    expect(normalizeOneDecimalInput("175.34")).toBe("175.3");
    expect(normalizeOneDecimalInput(".5")).toBe("0.5");
    expect(validateBodyProfile({ ...validDraft, age: "28.5" }, "2026-07-13").errors.age).toBe(
      "年龄需在 14–80 岁之间",
    );
  });

  it("rejects an optional target date that is not after today", () => {
    const result = validateBodyProfile({ ...validDraft, targetDate: "2026-07-13" }, "2026-07-13");
    expect(result.errors.targetDate).toBe("目标日期必须晚于今天");
  });

  it("accepts a valid body profile and creates a nutrition plan", () => {
    const result = validateBodyProfile(validDraft, "2026-07-13");
    expect(result.valid).toBe(true);
    expect(calculateNutritionPlan(result.profile!)).toMatchObject({ calories: expect.any(Number) });
  });

  it("creates distinct energy targets and macro plans for all four goals", () => {
    const body = validateBodyProfile(validDraft, "2026-07-13").profile!;
    const plans = ["muscle_gain", "fat_loss", "maintenance", "performance"].map((goalType) =>
      calculateNutritionPlan({ ...body, goalType: goalType as typeof body.goalType }),
    );
    const calories = plans.map((plan) => plan.calories);
    expect(new Set(calories).size).toBe(4);
    expect(new Set(plans.map((plan) => `${plan.proteinG}/${plan.carbsG}/${plan.fatG}`)).size).toBe(
      4,
    );
  });

  it("recalculates daily targets when each body input, activity level, or goal changes", () => {
    const body = validateBodyProfile(validDraft, "2026-07-13").profile!;
    const baseline = calculateNutritionPlan({ ...body, goalType: "performance" });
    const variants = [
      calculateNutritionPlan({ ...body, gender: "female", goalType: "performance" }),
      calculateNutritionPlan({ ...body, age: 45, goalType: "performance" }),
      calculateNutritionPlan({ ...body, heightCm: 185, goalType: "performance" }),
      calculateNutritionPlan({ ...body, weightKg: 80, goalType: "performance" }),
      calculateNutritionPlan({ ...body, activityLevel: "high", goalType: "performance" }),
      calculateNutritionPlan({ ...body, goalType: "fat_loss" }),
    ];

    for (const plan of variants) expect(plan.calories).not.toBe(baseline.calories);
    expect(baseline).toMatchObject({ calories: 2780, proteinG: 126, carbsG: 427, fatG: 63 });
    const veryHigh = calculateNutritionPlan({ ...body, activityLevel: "very_high" as never, goalType: "performance" });
    expect(veryHigh.calories).toBeGreaterThan(variants[4].calories);
  });

  it("keeps macro calorie conversion within three percent of target calories", () => {
    const body = validateBodyProfile(validDraft, "2026-07-13").profile!;
    for (const goalType of ["muscle_gain", "fat_loss", "maintenance", "performance"] as const) {
      const plan = calculateNutritionPlan({ ...body, goalType });
      const macroCalories = plan.proteinG * 4 + plan.carbsG * 4 + plan.fatG * 9;
      expect(Math.abs(macroCalories - plan.calories) / plan.calories).toBeLessThanOrEqual(0.03);
    }
  });

  it("reports energy-share percentages that sum near 100", () => {
    const body = validateBodyProfile(validDraft, "2026-07-13").profile!;
    const plan = calculateNutritionPlan(body);
    const percents = macroEnergyPercents(plan);
    expect(percents.proteinPct + percents.carbsPct + percents.fatPct).toBeGreaterThanOrEqual(98);
    expect(percents.proteinPct + percents.carbsPct + percents.fatPct).toBeLessThanOrEqual(102);
  });

  it("resets the draft to its initial, non-sensitive state", () => {
    const store = createOnboardingDraftStore();
    store.getState().setDraft(validDraft);
    store.getState().reset();
    expect(store.getState().draft).toEqual(createInitialOnboardingDraft());
  });

  it("restores a short-term local draft without persisting errors", () => {
    let savedDraft: OnboardingDraft | null = null;
    const storage = {
      read: () => savedDraft,
      write: (draft: OnboardingDraft) => {
        savedDraft = draft;
      },
      clear: () => {
        savedDraft = null;
      },
    };
    const firstStore = createOnboardingDraftStore(storage);
    firstStore.getState().setField("goalType", "performance");
    const restoredStore = createOnboardingDraftStore(storage);
    expect(restoredStore.getState().draft.goalType).toBe("performance");
    expect(restoredStore.getState().errors).toEqual({});
  });
});
