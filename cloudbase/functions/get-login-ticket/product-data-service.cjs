function fail(message) {
  const error = new Error(message);
  error.code = "PRODUCT_DATA_INVALID";
  return error;
}

function assertNumber(value, min, max, field) {
  if (!Number.isFinite(value) || value < min || value > max) throw fail(`${field} 无效`);
}

function assertBodyProfile(input) {
  assertNumber(input.age, 14, 80, "年龄");
  assertNumber(input.heightCm, 120, 230, "身高");
  assertNumber(input.weightKg, 30, 300, "体重");
  assertNumber(input.trainingDays, 0, 7, "训练天数");
  if (!["female", "male", "undisclosed"].includes(input.sex)) throw fail("性别无效");
  if (!["sedentary", "light", "moderate", "high", "very_high"].includes(input.activityLevel)) throw fail("活动水平无效");
}

function assertGoal(input) {
  if (!["muscle_gain", "fat_loss", "maintain", "performance"].includes(input.goalType)) throw fail("目标类型无效");
  if (input.targetWeightKg !== null) assertNumber(input.targetWeightKg, 30, 300, "目标体重");
  if (input.targetCaloriesKcal !== null) assertNumber(input.targetCaloriesKcal, 1000, 6000, "目标热量");
  if (input.targetDate !== null && (typeof input.targetDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.targetDate))) throw fail("目标日期无效");
}

function assertOnboarding(input) {
  const nickname = typeof input.nickname === "string" ? input.nickname.trim() : "";
  if (!nickname || nickname.length > 40) throw fail("昵称无效");
  assertBodyProfile({
    age: input.age,
    sex: input.sex,
    heightCm: input.heightCm,
    weightKg: input.weightKg,
    activityLevel: input.activityLevel,
    trainingDays: input.trainingDays,
  });
  assertGoal({
    goalType: input.goalType,
    targetWeightKg: input.targetWeightKg,
    targetCaloriesKcal: input.calories,
    targetDate: input.targetDate,
  });
  if (!Array.isArray(input.foodAvoidances) || input.foodAvoidances.some((value) => typeof value !== "string" || value.length > 80)) throw fail("饮食限制无效");
  if (typeof input.dietaryPattern !== "string" || input.dietaryPattern.length > 40) throw fail("饮食偏好无效");
  assertNumber(input.mealsPerDay, 2, 5, "每日餐数");
  assertNumber(input.proteinG, 0, 1000, "蛋白质目标");
  assertNumber(input.carbsG, 0, 1500, "碳水目标");
  assertNumber(input.fatG, 0, 500, "脂肪目标");
}

function createProductDataService({ db, record = () => {} }) {
  return {
    async saveProfile(userId, input) {
      const nickname = typeof input?.nickname === "string" ? input.nickname.trim().slice(0, 40) : "";
      if (!nickname) throw fail("昵称无效");
      const table = db.from("profiles");
      const existing = await table.select("id").eq("id", userId).maybeSingle();
      let result;
      if (existing.error) throw new Error("Profile lookup failed");
      if (existing.data?.id) {
        record({ table: "profiles", operation: "update", userId });
        result = await table.update({ nickname }).eq("id", userId).select().single();
      } else {
        record({ table: "profiles", operation: "insert", userId });
        result = await table.insert({ id: userId, nickname }).select().single();
      }
      if (result.error || !result.data) throw new Error("Profile save failed");
      return result.data;
    },

    async saveBodyProfile(userId, input) {
      assertBodyProfile(input);
      const table = db.from("body_profiles");
      record({ table: "body_profiles", operation: "clear-current", userId });
      const retired = await table.update({ is_current: false }).eq("user_id", userId).eq("is_current", true);
      if (retired?.error) throw new Error("Body profile retirement failed");
      record({ table: "body_profiles", operation: "insert-current", userId });
      const result = await table.insert({
        user_id: userId, age: input.age, birth_date: input.birthDate ?? null, sex: input.sex,
        height_cm: input.heightCm, weight_kg: input.weightKg, activity_level: input.activityLevel,
        training_days_per_week: input.trainingDays, is_current: true,
      }).select().single();
      if (result.error || !result.data) throw new Error("Body profile save failed");
      return result.data;
    },

    async saveGoal(userId, input) {
      assertGoal(input);
      const table = db.from("user_goals");
      record({ table: "user_goals", operation: "clear-current", userId });
      const retired = await table.update({ is_current: false }).eq("user_id", userId).eq("is_current", true);
      if (retired?.error) throw new Error("Goal retirement failed");
      record({ table: "user_goals", operation: "insert-current", userId });
      const result = await table.insert({
        user_id: userId, goal_type: input.goalType, target_weight_kg: input.targetWeightKg,
        target_calories_kcal: input.targetCaloriesKcal, target_date: input.targetDate, is_current: true,
      }).select().single();
      if (result.error || !result.data) throw new Error("Goal save failed");
      return result.data;
    },

    async saveOnboarding(userId, input) {
      assertOnboarding(input);
      const nickname = input.nickname.trim().slice(0, 40);
      const goal = await this.saveGoal(userId, {
        goalType: input.goalType,
        targetWeightKg: input.targetWeightKg,
        targetCaloriesKcal: input.calories,
        targetDate: input.targetDate,
      });
      const bodyProfile = await this.saveBodyProfile(userId, {
        age: input.age,
        birthDate: null,
        sex: input.sex,
        heightCm: input.heightCm,
        weightKg: input.weightKg,
        activityLevel: input.activityLevel,
        trainingDays: input.trainingDays,
      });

      const settingsTable = db.from("user_settings");
      const existingSettings = await settingsTable.select("id").eq("id", userId).maybeSingle();
      if (existingSettings.error) throw new Error("Settings lookup failed");
      record({ table: "user_settings", operation: existingSettings.data?.id ? "update" : "insert", userId });
      const settings = existingSettings.data?.id
        ? await settingsTable.update({ dietary_pattern: input.dietaryPattern, food_avoidances: input.foodAvoidances, meals_per_day: input.mealsPerDay }).eq("id", userId).select().single()
        : await settingsTable.insert({ id: userId, dietary_pattern: input.dietaryPattern, food_avoidances: input.foodAvoidances, meals_per_day: input.mealsPerDay }).select().single();
      if (settings.error || !settings.data) throw new Error("Settings save failed");

      const planTable = db.from("nutrition_plans");
      record({ table: "nutrition_plans", operation: "insert", userId });
      const plan = await planTable.insert({
        user_id: userId, goal_id: goal.id, body_profile_id: bodyProfile.id,
        daily_calories_kcal: input.calories, protein_g: input.proteinG, carbs_g: input.carbsG, fat_g: input.fatG,
        calculation_source: "formula_v1", status: "active", activated_at: new Date().toISOString(),
      }).select().single();
      if (plan.error || !plan.data) throw new Error("Nutrition plan save failed");

      const profileTable = db.from("profiles");
      const existingProfile = await profileTable.select("id").eq("id", userId).maybeSingle();
      if (existingProfile.error) throw new Error("Profile lookup failed");
      record({ table: "profiles", operation: existingProfile.data?.id ? "complete-onboarding" : "insert-completed", userId });
      const profile = existingProfile.data?.id
        ? await profileTable.update({ nickname, onboarding_completed_at: new Date().toISOString() }).eq("id", userId).select().single()
        : await profileTable.insert({ id: userId, nickname, onboarding_completed_at: new Date().toISOString() }).select().single();
      if (profile.error || !profile.data) throw new Error("Onboarding completion save failed");

      return { userId, nickname: profile.data.nickname, goalId: goal.id, bodyProfileId: bodyProfile.id, nutritionPlanId: plan.data.id };
    },

    async getAccount(userId) {
      const [profile, bodyProfile, goal] = await Promise.all([
        db.from("profiles").select("nickname").eq("id", userId).maybeSingle(),
        db.from("body_profiles").select("age,sex,height_cm,weight_kg,activity_level,training_days_per_week").eq("user_id", userId).eq("is_current", true).maybeSingle(),
        db.from("user_goals").select("goal_type,target_weight_kg,target_calories_kcal").eq("user_id", userId).eq("is_current", true).maybeSingle(),
      ]);
      if (profile.error || bodyProfile.error || goal.error) throw new Error("Account read failed");
      return {
        nickname: profile.data?.nickname ?? null,
        age: bodyProfile.data?.age ?? null,
        sex: bodyProfile.data?.sex ?? null,
        heightCm: bodyProfile.data?.height_cm ?? null,
        weightKg: bodyProfile.data?.weight_kg ?? null,
        activityLevel: bodyProfile.data?.activity_level ?? null,
        trainingDays: bodyProfile.data?.training_days_per_week ?? null,
        goalType: goal.data?.goal_type ?? null,
        targetWeightKg: goal.data?.target_weight_kg ?? null,
        targetCaloriesKcal: goal.data?.target_calories_kcal ?? null,
      };
    },
  };
}

module.exports = { createProductDataService };
