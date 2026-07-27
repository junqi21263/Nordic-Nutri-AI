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

function normalizeSettings(input) {
  const dietaryPatterns = ["none", "vegetarian", "vegan", "pescatarian", "low_carb", "keto", "mediterranean", "halal"];
  if (!dietaryPatterns.includes(input?.dietaryPattern)) throw fail("饮食偏好无效");
  if (!Array.isArray(input.foodAvoidances) || input.foodAvoidances.length > 20 || input.foodAvoidances.some((value) => typeof value !== "string" || !value.trim() || value.length > 80)) throw fail("饮食限制无效");
  assertNumber(input.mealsPerDay, 2, 5, "每日餐数");
  if (!["light", "dark", "system"].includes(input.theme)) throw fail("主题无效");
  if (!["zh-CN", "en"].includes(input.language)) throw fail("语言无效");
  if (!["metric", "imperial"].includes(input.unit)) throw fail("单位无效");
  if (typeof input.notification !== "boolean") throw fail("通知设置无效");
  return {
    dietary_pattern: input.dietaryPattern,
    food_avoidances: input.foodAvoidances.map((value) => value.trim()),
    meals_per_day: input.mealsPerDay,
    theme: input.theme,
    locale: input.language,
    notification_enabled: input.notification,
    unit_system: input.unit,
  };
}

function normalizePlan(input) {
  assertNumber(input?.calories, 800, 10000, "热量目标");
  assertNumber(input?.proteinG, 1, 1000, "蛋白质目标");
  assertNumber(input?.carbsG, 0, 1500, "碳水目标");
  assertNumber(input?.fatG, 1, 500, "脂肪目标");
  return {
    daily_calories_kcal: input.calories,
    protein_g: input.proteinG,
    carbs_g: input.carbsG,
    fat_g: input.fatG,
  };
}

function mapSettings(row) {
  if (!row) return null;
  return {
    dietaryPattern: row.dietary_pattern,
    foodAvoidances: Array.isArray(row.food_avoidances) ? row.food_avoidances : [],
    mealsPerDay: Number(row.meals_per_day),
    theme: row.theme,
    language: row.locale,
    notification: Boolean(row.notification_enabled),
    unit: row.unit_system,
  };
}

function mapPlan(row) {
  if (!row) return null;
  return {
    id: row.id,
    calories: Number(row.daily_calories_kcal),
    proteinG: Number(row.protein_g),
    carbsG: Number(row.carbs_g),
    fatG: Number(row.fat_g),
    status: row.status,
  };
}

function createProductDataService({ db, record = () => {}, resolveAvatarUrl = async () => null }) {
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

    async saveAvatarPath(userId, avatarPath) {
      if (typeof avatarPath !== "string" || !avatarPath.trim()) throw fail("头像无效");
      const table = db.from("profiles");
      const existing = await table.select("id").eq("id", userId).maybeSingle();
      if (existing.error) throw new Error("Profile lookup failed");
      record({ table: "profiles", operation: "update-avatar", userId });
      if (!existing.data?.id) {
        const result = await table
          .insert({ id: userId, nickname: "微信用户", avatar_path: avatarPath })
          .select()
          .single();
        if (result.error || !result.data) throw new Error("Avatar save failed");
        return result.data;
      }
      const result = await table.update({ avatar_path: avatarPath }).eq("id", userId).select().single();
      if (result.error || !result.data) throw new Error("Avatar save failed");
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
      record({ table: "nutrition_plans", operation: "retire-active", userId });
      const retiredPlan = await planTable.update({
        status: "superseded",
        effective_to: new Date().toISOString(),
      }).eq("user_id", userId).eq("status", "active");
      if (retiredPlan?.error) throw new Error("Nutrition plan retirement failed");
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

    async saveSettings(userId, input) {
      const payload = normalizeSettings(input);
      const table = db.from("user_settings");
      const existing = await table.select("id").eq("id", userId).maybeSingle();
      if (existing.error) throw new Error("Settings lookup failed");
      record({ table: "user_settings", operation: existing.data?.id ? "update" : "insert", userId });
      const saved = existing.data?.id
        ? await table.update(payload).eq("id", userId).select().single()
        : await table.insert({ id: userId, ...payload }).select().single();
      if (saved.error || !saved.data) throw new Error("Settings save failed");
      return mapSettings(saved.data);
    },

    async getNutritionPlan(userId) {
      const result = await db.from("nutrition_plans").select("*").eq("user_id", userId).eq("status", "active").maybeSingle();
      if (result.error) throw new Error("Nutrition plan read failed");
      return mapPlan(result.data);
    },

    async saveNutritionPlan(userId, input) {
      const values = normalizePlan(input);
      const table = db.from("nutrition_plans");
      const [current, goal, bodyProfile] = await Promise.all([
        table.select("*").eq("user_id", userId).eq("status", "active").maybeSingle(),
        db.from("user_goals").select("id").eq("user_id", userId).eq("is_current", true).maybeSingle(),
        db.from("body_profiles").select("id").eq("user_id", userId).eq("is_current", true).maybeSingle(),
      ]);
      if (current.error || goal.error || bodyProfile.error || !current.data?.id || !goal.data?.id || !bodyProfile.data?.id) throw fail("当前计划不存在");
      const now = new Date().toISOString();
      const retired = await table.update({ status: "superseded", effective_to: now }).eq("id", current.data.id).eq("user_id", userId);
      if (retired?.error) throw new Error("Nutrition plan retirement failed");
      const saved = await table.insert({
        user_id: userId,
        goal_id: goal.data.id,
        body_profile_id: bodyProfile.data.id,
        ...values,
        calculation_source: "manual",
        status: "active",
        version: Number(current.data.version ?? 1) + 1,
        effective_from: now,
        activated_at: now,
      }).select().single();
      if (saved.error || !saved.data) throw new Error("Nutrition plan save failed");
      return mapPlan(saved.data);
    },

    async getAccount(userId) {
      const [profile, bodyProfile, goal, settings, plan] = await Promise.all([
        db.from("profiles").select("nickname,avatar_path").eq("id", userId).maybeSingle(),
        db.from("body_profiles").select("age,sex,height_cm,weight_kg,activity_level,training_days_per_week").eq("user_id", userId).eq("is_current", true).maybeSingle(),
        db.from("user_goals").select("goal_type,target_weight_kg,target_calories_kcal").eq("user_id", userId).eq("is_current", true).maybeSingle(),
        db.from("user_settings").select("dietary_pattern,food_avoidances,meals_per_day,theme,locale,notification_enabled,unit_system").eq("id", userId).maybeSingle(),
        db.from("nutrition_plans").select("id,daily_calories_kcal,protein_g,carbs_g,fat_g,status").eq("user_id", userId).eq("status", "active").maybeSingle(),
      ]);
      if (profile.error || bodyProfile.error || goal.error || settings.error || plan.error) throw new Error("Account read failed");
      let avatarUrl = null;
      const avatarPath = typeof profile.data?.avatar_path === "string" ? profile.data.avatar_path.trim() : null;
      if (avatarPath) {
        try { avatarUrl = await resolveAvatarUrl(avatarPath); } catch { avatarUrl = null; }
        // Keep default:/data:/https refs even if storage resolution fails.
        if (!avatarUrl && (avatarPath.startsWith("default:") || avatarPath.startsWith("data:") || /^https?:\/\//i.test(avatarPath))) {
          avatarUrl = avatarPath;
        }
        // Tiny inline images are almost always WeChat's grey placeholder silhouette
        // that previously overwrote default:robot-N during silent getUserInfo sync.
        let tinyInlinePlaceholder = false;
        if (avatarPath.startsWith("data:image/")) {
          const comma = avatarPath.indexOf(",");
          if (comma >= 0) {
            const bytes = Math.floor(((avatarPath.length - comma - 1) * 3) / 4);
            tinyInlinePlaceholder = bytes > 0 && bytes < 16_384;
          }
        }
        const shouldRepair = tinyInlinePlaceholder || !avatarUrl;
        if (shouldRepair) {
          const robotIndex = 1 + Math.floor(Math.random() * 4);
          const repaired = `default:robot-${robotIndex}`;
          try {
            await db.from("profiles").update({ avatar_path: repaired }).eq("id", userId);
            avatarUrl = repaired;
          } catch {
            avatarUrl = repaired;
          }
        }
      }
      return {
        nickname: profile.data?.nickname ?? null,
        avatarUrl,
        age: bodyProfile.data?.age ?? null,
        sex: bodyProfile.data?.sex ?? null,
        heightCm: bodyProfile.data?.height_cm ?? null,
        weightKg: bodyProfile.data?.weight_kg ?? null,
        activityLevel: bodyProfile.data?.activity_level ?? null,
        trainingDays: bodyProfile.data?.training_days_per_week ?? null,
        goalType: goal.data?.goal_type ?? null,
        targetWeightKg: goal.data?.target_weight_kg ?? null,
        targetCaloriesKcal: goal.data?.target_calories_kcal ?? null,
        settings: mapSettings(settings.data),
        nutritionPlan: mapPlan(plan.data),
      };
    },
  };
}

module.exports = { createProductDataService };
