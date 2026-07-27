export type GoalType = "muscle_gain" | "fat_loss" | "maintenance" | "performance";
export type Gender = "male" | "female";
export type ActivityLevel = "sedentary" | "light" | "moderate" | "high";
export type DietaryPattern =
  "none" | "vegetarian" | "vegan" | "pescatarian" | "low_carb" | "keto" | "mediterranean" | "halal";
export type FoodAvoidance =
  "dairy" | "nuts" | "seafood" | "beef" | "eggs" | "gluten" | "pork" | "soy" | "spicy";

export interface OnboardingDraft {
  nickname: string;
  goalType: GoalType | null;
  age: string;
  gender: Gender | null;
  heightCm: string;
  weightKg: string;
  activityLevel: ActivityLevel | null;
  trainingDays: string;
  targetWeightKg: string;
  targetDate: string;
  dietaryPattern: DietaryPattern;
  foodAvoidances: FoodAvoidance[];
  mealsPerDay: "2" | "3" | "4" | "5";
}

export type OnboardingField = keyof OnboardingDraft;
export type FieldErrors = Partial<Record<OnboardingField, string>>;

export interface ValidBodyProfile {
  nickname: string;
  goalType: GoalType;
  age: number;
  gender: Gender;
  heightCm: number;
  weightKg: number;
  activityLevel: ActivityLevel;
  trainingDays: number;
  targetWeightKg: number | null;
  targetDate: string | null;
}

export interface BodyProfileValidation {
  valid: boolean;
  errors: FieldErrors;
  profile?: ValidBodyProfile;
}

export interface NutritionPlanPreview {
  goalType: GoalType;
  bmr: number;
  tdee: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

const activityMultiplier: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  high: 1.725,
};

const proteinPerKg: Record<GoalType, number> = {
  muscle_gain: 2,
  fat_loss: 2,
  maintenance: 1.6,
  performance: 1.8,
};

export function createInitialOnboardingDraft(): OnboardingDraft {
  return {
    nickname: "",
    goalType: null,
    age: "",
    gender: null,
    heightCm: "",
    weightKg: "",
    activityLevel: null,
    trainingDays: "",
    targetWeightKg: "",
    targetDate: "",
    dietaryPattern: "none",
    foodAvoidances: [],
    mealsPerDay: "3",
  };
}

export function getLocalDateString(daysFromToday = 0): string {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function validateGoal(goalType: GoalType | null): string | undefined {
  return goalType ? undefined : "请选择你的目标";
}

export function normalizeAgeInput(value: string): string {
  const integerPortion = value.split(".", 1)[0] ?? "";
  return integerPortion.replace(/\D/g, "");
}

export function normalizeOneDecimalInput(value: string): string {
  const sanitized = value.replace(/[^\d.]/g, "");
  const [integerPart = "", ...decimalParts] = sanitized.split(".");
  const hasDecimal = sanitized.includes(".");
  const normalizedInteger = integerPart || (hasDecimal ? "0" : "");
  const decimalPart = decimalParts.join("").slice(0, 1);

  return hasDecimal ? `${normalizedInteger}.${decimalPart}` : normalizedInteger;
}

function numberInRange(value: string, min: number, max: number): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max ? parsed : undefined;
}

function integerInRange(value: string, min: number, max: number): number | undefined {
  const parsed = numberInRange(value, min, max);
  return parsed !== undefined && Number.isInteger(parsed) ? parsed : undefined;
}

export function validateBodyProfile(draft: OnboardingDraft, today: string): BodyProfileValidation {
  const errors: FieldErrors = {};
  const nickname = draft.nickname.trim().slice(0, 40);
  const age = integerInRange(draft.age, 14, 80);
  const heightCm = numberInRange(draft.heightCm, 120, 230);
  const weightKg = numberInRange(draft.weightKg, 30, 300);
  const trainingDays = numberInRange(draft.trainingDays, 0, 7);
  const targetWeightKg = draft.targetWeightKg ? numberInRange(draft.targetWeightKg, 30, 300) : null;

  if (!nickname) errors.nickname = "请输入昵称";
  if (age === undefined) errors.age = "年龄需在 14–80 岁之间";
  if (!draft.gender) errors.gender = "请选择性别";
  if (heightCm === undefined) errors.heightCm = "身高需在 120–230 cm 之间";
  if (weightKg === undefined) errors.weightKg = "体重需在 30–300 kg 之间";
  if (!draft.activityLevel) errors.activityLevel = "请选择日常活动量";
  if (trainingDays === undefined) errors.trainingDays = "训练频率需在 0–7 天之间";
  if (draft.targetWeightKg && targetWeightKg === undefined) {
    errors.targetWeightKg = "目标体重需在 30–300 kg 之间";
  }
  if (draft.targetDate && draft.targetDate <= today) {
    errors.targetDate = "目标日期必须晚于今天";
  }
  if (!draft.goalType) errors.goalType = "请选择你的目标";

  if (Object.keys(errors).length > 0 || !draft.goalType || !draft.gender || !draft.activityLevel) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    errors,
    profile: {
      goalType: draft.goalType,
      nickname,
      age: age!,
      gender: draft.gender,
      heightCm: heightCm!,
      weightKg: weightKg!,
      activityLevel: draft.activityLevel,
      trainingDays: trainingDays!,
      targetWeightKg: targetWeightKg ?? null,
      targetDate: draft.targetDate || null,
    },
  };
}

export function calculateNutritionPlan(profile: ValidBodyProfile): NutritionPlanPreview {
  const bmr =
    10 * profile.weightKg +
    6.25 * profile.heightCm -
    5 * profile.age +
    (profile.gender === "male" ? 5 : -161);
  const tdee = bmr * activityMultiplier[profile.activityLevel];
  const rawCalories =
    profile.goalType === "muscle_gain"
      ? tdee + 300
      : profile.goalType === "fat_loss"
        ? tdee - 400
        : profile.goalType === "performance"
          ? tdee * 1.08
          : tdee;
  const calories = Math.round(rawCalories / 10) * 10;
  const proteinG = Math.round(profile.weightKg * proteinPerKg[profile.goalType]);
  const fatG = Math.round(profile.weightKg * 0.9);
  const carbsG = Math.max(0, Math.round((calories - proteinG * 4 - fatG * 9) / 4));

  return {
    goalType: profile.goalType,
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    calories,
    proteinG,
    carbsG,
    fatG,
  };
}

/** Energy-share percentages for protein / carbs / fat (sum ≈ 100). */
export function macroEnergyPercents(plan: {
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}): { proteinPct: number; carbsPct: number; fatPct: number } {
  const calories = Math.max(plan.calories, 1);
  const proteinKcal = plan.proteinG * 4;
  const carbsKcal = plan.carbsG * 4;
  const fatKcal = plan.fatG * 9;
  const total = proteinKcal + carbsKcal + fatKcal || calories;
  return {
    proteinPct: Math.round((proteinKcal / total) * 100),
    carbsPct: Math.round((carbsKcal / total) * 100),
    fatPct: Math.round((fatKcal / total) * 100),
  };
}
