import assert from "node:assert/strict";
import test from "node:test";

import { createProductDataService } from "./product-data-service.cjs";

test("writes a profile for the authenticated business user only", async () => {
  const calls = [];
  const db = {
    from: (table) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "user-1" }, error: null }) }) }),
      update: (payload) => ({ eq: () => ({ select: () => ({ single: async () => ({ data: { id: "user-1", ...payload }, error: null }) }) }) }),
    }),
  };
  const service = createProductDataService({ db, record: (call) => calls.push(call) });

  const result = await service.saveProfile("user-1", { nickname: "Lewis" });

  assert.equal(result.nickname, "Lewis");
  assert.deepEqual(calls, [{ table: "profiles", operation: "update", userId: "user-1" }]);
});

test("rejects banned nicknames before writing profiles", async () => {
  const service = createProductDataService({
    db: {
      from: () => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "user-1" }, error: null }) }) }),
        update: () => ({ eq: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }) }),
      }),
    },
  });

  await assert.rejects(
    () => service.saveProfile("user-1", { nickname: "官方客服" }),
    (error) => error instanceof Error && error.message === "昵称包含不当内容，请更换" && error.code === "PRODUCT_DATA_INVALID",
  );
});

test("versions a body profile instead of trusting a caller-supplied user ID", async () => {
  const calls = [];
  const db = {
    from: (table) => ({
      update: (payload) => ({ eq: () => ({ eq: () => ({ then: (resolve) => resolve({ error: null }), payload }) }) }),
      insert: (payload) => ({ select: () => ({ single: async () => ({ data: { id: "body-1", ...payload }, error: null }) }) }),
    }),
  };
  const service = createProductDataService({ db, record: (call) => calls.push(call) });

  const result = await service.saveBodyProfile("user-1", {
    age: 28, sex: "male", heightCm: 175, weightKg: 70, activityLevel: "moderate", trainingDays: 4,
  });

  assert.equal(result.user_id, "user-1");
  assert.deepEqual(calls, [
    { table: "body_profiles", operation: "clear-current", userId: "user-1" },
    { table: "body_profiles", operation: "insert-current", userId: "user-1" },
  ]);
});

test("versions a health goal and persists its daily calorie target for the authenticated business user", async () => {
  const calls = [];
  const db = {
    from: () => ({
      update: () => ({ eq: () => ({ eq: () => ({ then: (resolve) => resolve({ error: null }) }) }) }),
      insert: (payload) => ({ select: () => ({ single: async () => ({ data: { id: "goal-1", ...payload }, error: null }) }) }),
    }),
  };
  const service = createProductDataService({ db, record: (call) => calls.push(call) });

  const result = await service.saveGoal("user-1", {
    goalType: "maintain", targetWeightKg: 68, targetCaloriesKcal: 2200, targetDate: null,
  });

  assert.equal(result.user_id, "user-1");
  assert.equal(result.goal_type, "maintain");
  assert.equal(result.target_calories_kcal, 2200);
  assert.deepEqual(calls, [
    { table: "user_goals", operation: "clear-current", userId: "user-1" },
    { table: "user_goals", operation: "insert-current", userId: "user-1" },
  ]);
});

test("completes onboarding through authenticated server-side tables only", async () => {
  const calls = [];
  const db = {
    from: (table) => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      update: () => ({ eq: () => ({ eq: () => ({ then: (resolve) => resolve({ error: null }) }), select: () => ({ single: async () => ({ data: { id: table }, error: null }) }) }) }),
      insert: (payload) => ({ select: () => ({ single: async () => ({ data: { id: `${table}-1`, ...payload }, error: null }) }) }),
    }),
  };
  const service = createProductDataService({ db, record: (call) => calls.push(call) });

  const result = await service.saveOnboarding("user-1", {
    nickname: "Lewis",
    goalType: "muscle_gain", targetWeightKg: 72, targetDate: null,
    age: 28, sex: "male", heightCm: 175, weightKg: 76, activityLevel: "moderate", trainingDays: 4,
    dietaryPattern: "none", foodAvoidances: [], mealsPerDay: 3,
    calories: 2400, proteinG: 160, carbsG: 260, fatG: 70,
  });

  assert.equal(result.userId, "user-1");
  assert.equal(result.nickname, "Lewis");
  assert.deepEqual(calls.map((call) => call.table), [
    "user_goals", "user_goals", "body_profiles", "body_profiles", "user_settings",
    "nutrition_plans", "nutrition_plans", "profiles",
  ]);
  assert.equal(calls[5].operation, "retire-active");
});

test("reads only the authenticated user's current account records", async () => {
  const filters = [];
  const rows = {
    profiles: { nickname: "Lewis" },
    body_profiles: { age: 28, sex: "male", height_cm: 175, weight_kg: 76, activity_level: "moderate", training_days_per_week: 4 },
    user_goals: { goal_type: "muscle_gain", target_weight_kg: 72, target_calories_kcal: 2400 },
    user_settings: { dietary_pattern: "none", food_avoidances: ["peanut"], meals_per_day: 4, theme: "system", locale: "zh-CN", notification_enabled: true, unit_system: "metric" },
    nutrition_plans: { id: "plan-1", daily_calories_kcal: 2400, protein_g: 160, carbs_g: 260, fat_g: 70, status: "active" },
  };
  const db = { from: (table) => ({ select: () => ({ eq: (column, value) => ({ eq: () => ({ maybeSingle: async () => ({ data: rows[table], error: null }) }), maybeSingle: async () => { filters.push([table, column, value]); return { data: rows[table], error: null }; } }) }) }) };
  const result = await createProductDataService({ db }).getAccount("user-1");
  assert.equal(result.nickname, "Lewis");
  assert.equal(result.weightKg, 76);
  assert.deepEqual({
    age: result.age, sex: result.sex, heightCm: result.heightCm,
    activityLevel: result.activityLevel, trainingDays: result.trainingDays,
  }, { age: 28, sex: "male", heightCm: 175, activityLevel: "moderate", trainingDays: 4 });
  assert.deepEqual(result.settings, {
    dietaryPattern: "none", foodAvoidances: ["peanut"], mealsPerDay: 4,
    theme: "system", language: "zh-CN", notification: true, unit: "metric",
  });
  assert.deepEqual(result.nutritionPlan, {
    id: "plan-1", calories: 2400, proteinG: 160, carbsG: 260, fatG: 70, status: "active",
  });
  assert.deepEqual(filters, [["profiles", "id", "user-1"], ["user_settings", "id", "user-1"]]);
});

test("resolves a signed-in user's stored avatar path into a temporary avatar URL", async () => {
  const rows = {
    profiles: { nickname: "Lewis", avatar_path: "cloud://env.avatars/user-1/profile.jpg" },
    body_profiles: null,
    user_goals: null,
    user_settings: null,
    nutrition_plans: null,
  };
  const db = { from: (table) => ({ select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: rows[table], error: null }) }), maybeSingle: async () => ({ data: rows[table], error: null }) }) }) }) };

  const result = await createProductDataService({
    db,
    resolveAvatarUrl: async (path) => path === rows.profiles.avatar_path ? "https://temp.example/avatar.jpg" : null,
  }).getAccount("user-1");

  assert.equal(result.avatarUrl, "https://temp.example/avatar.jpg");
});

test("repairs tiny WeChat placeholder data URLs back to a default robot avatar", async () => {
  const tinyPng = `data:image/png;base64,${Buffer.alloc(1200, 1).toString("base64")}`;
  const rows = {
    profiles: { nickname: "果园探索家", avatar_path: tinyPng },
    body_profiles: null,
    user_goals: null,
    user_settings: null,
    nutrition_plans: null,
  };
  const updates = [];
  const db = {
    from: (table) => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: rows[table], error: null }) }),
          maybeSingle: async () => ({ data: rows[table], error: null }),
        }),
      }),
      update: (payload) => ({
        eq: async () => {
          updates.push(payload);
          return { data: null, error: null };
        },
      }),
    }),
  };

  const result = await createProductDataService({
    db,
    resolveAvatarUrl: async (path) => path,
  }).getAccount("user-1");

  assert.match(result.avatarUrl, /^default:robot-[1-4]$/);
  assert.match(updates[0]?.avatar_path, /^default:robot-[1-4]$/);
});

test("upserts settings for the authenticated user", async () => {
  const writes = [];
  const db = {
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "user-1" }, error: null }) }) }),
      update: (payload) => ({ eq: () => ({ select: () => ({ single: async () => { writes.push(payload); return { data: { id: "user-1", ...payload }, error: null }; } }) }) }),
    }),
  };
  const result = await createProductDataService({ db }).saveSettings("user-1", {
    dietaryPattern: "none", foodAvoidances: ["peanut"], mealsPerDay: 4,
    theme: "dark", language: "zh-CN", notification: false, unit: "metric",
  });
  assert.equal(result.dietaryPattern, "none");
  assert.deepEqual(writes[0], {
    dietary_pattern: "none", food_avoidances: ["peanut"], meals_per_day: 4,
    theme: "dark", locale: "zh-CN", notification_enabled: false, unit_system: "metric",
  });
});

test("versions the active nutrition plan for the authenticated user", async () => {
  const writes = [];
  const db = {
    from: (table) => ({
      select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({
        data: table === "nutrition_plans" ? { id: "plan-old", goal_id: "goal-old", body_profile_id: "body-old" }
          : table === "user_goals" ? { id: "goal-current" }
            : { id: "body-current" },
        error: null,
      }) }) }) }),
      update: (payload) => ({ eq: () => ({ eq: () => ({ then: (resolve) => { writes.push({ operation: "retire", payload }); return resolve({ error: null }); } }) }) }),
      insert: (payload) => ({ select: () => ({ single: async () => { writes.push({ operation: "insert", payload }); return { data: { id: "plan-new", ...payload }, error: null }; } }) }),
    }),
  };
  const result = await createProductDataService({ db }).saveNutritionPlan("user-1", {
    calories: 2300, proteinG: 170, carbsG: 240, fatG: 65,
  });
  assert.equal(result.id, "plan-new");
  assert.equal(writes[1].payload.user_id, "user-1");
  assert.equal(writes[1].payload.goal_id, "goal-current");
  assert.equal(writes[1].payload.body_profile_id, "body-current");
  assert.equal(writes[1].payload.status, "active");
});
