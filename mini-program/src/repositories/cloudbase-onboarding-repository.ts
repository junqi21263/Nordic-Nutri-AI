type Row = Record<string, unknown>;

type QueryResult = Promise<{ data: Row | null; error: unknown }>;

export interface CloudbaseOnboardingClient {
  from: (table: string) => {
    insert: (payload: Row) => { select: () => { single: () => QueryResult } };
    update: (payload: Row) => {
      eq: (column: string, value: string) => { select: () => { single: () => QueryResult } };
    };
  };
}

export interface CloudbaseOnboardingInput {
  goalType: "muscle_gain" | "fat_loss" | "maintenance" | "performance";
  targetWeightKg: number | null;
  targetDate: string | null;
  age: number;
  sex: "female" | "male";
  heightCm: number;
  weightKg: number;
  activityLevel: "sedentary" | "light" | "moderate" | "high";
  trainingDays: number;
  dietaryPattern: string;
  foodAvoidances: string[];
  mealsPerDay: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
}

function databaseGoalType(goalType: CloudbaseOnboardingInput["goalType"]) {
  return goalType === "maintenance" ? "maintain" : goalType;
}

function rowId(row: Row | null, message: string): string {
  if (!row || typeof row.id !== "string" || !row.id) throw new Error(message);
  return row.id;
}

async function insertRow(client: CloudbaseOnboardingClient, table: string, payload: Row, message: string): Promise<string> {
  const { data, error } = await client.from(table).insert(payload).select().single();
  if (error) throw new Error(message);
  return rowId(data, message);
}

async function updateRow(client: CloudbaseOnboardingClient, table: string, userId: string, payload: Row, message: string): Promise<void> {
  const { data, error } = await client.from(table).update(payload).eq("id", userId).select().single();
  if (error || !data) throw new Error(message);
}

export async function completeCloudbaseOnboarding(
  client: CloudbaseOnboardingClient,
  userId: string,
  input: CloudbaseOnboardingInput,
): Promise<void> {
  const goalId = await insertRow(client, "user_goals", {
    goal_type: databaseGoalType(input.goalType),
    target_weight_kg: input.targetWeightKg,
    target_date: input.targetDate,
    is_current: true,
  }, "目标保存失败，请稍后重试");

  const bodyProfileId = await insertRow(client, "body_profiles", {
    age: input.age,
    sex: input.sex,
    height_cm: input.heightCm,
    weight_kg: input.weightKg,
    activity_level: input.activityLevel,
    training_days_per_week: input.trainingDays,
    is_current: true,
  }, "身体资料保存失败，请稍后重试");

  await updateRow(client, "user_settings", userId, {
    dietary_pattern: input.dietaryPattern,
    food_avoidances: input.foodAvoidances,
    meals_per_day: input.mealsPerDay,
  }, "饮食偏好保存失败，请稍后重试");

  await insertRow(client, "nutrition_plans", {
    goal_id: goalId,
    body_profile_id: bodyProfileId,
    daily_calories_kcal: input.calories,
    protein_g: input.proteinG,
    carbs_g: input.carbsG,
    fat_g: input.fatG,
    calculation_source: "formula_v1",
    status: "active",
    activated_at: new Date().toISOString(),
  }, "营养计划保存失败，请稍后重试");

  await updateRow(client, "profiles", userId, {
    onboarding_completed_at: new Date().toISOString(),
  }, "引导完成状态保存失败，请稍后重试");
}
