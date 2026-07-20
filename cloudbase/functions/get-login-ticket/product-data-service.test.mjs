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
    "user_goals", "user_goals", "body_profiles", "body_profiles", "user_settings", "nutrition_plans", "profiles",
  ]);
});

test("reads only the authenticated user's current account records", async () => {
  const filters = [];
  const rows = {
    profiles: { nickname: "Lewis" },
    body_profiles: { age: 28, sex: "male", height_cm: 175, weight_kg: 76, activity_level: "moderate", training_days_per_week: 4 },
    user_goals: { goal_type: "muscle_gain", target_weight_kg: 72, target_calories_kcal: 2400 },
  };
  const db = { from: (table) => ({ select: () => ({ eq: (column, value) => ({ eq: () => ({ maybeSingle: async () => ({ data: rows[table], error: null }) }), maybeSingle: async () => { filters.push([table, column, value]); return { data: rows[table], error: null }; } }) }) }) };
  const result = await createProductDataService({ db }).getAccount("user-1");
  assert.equal(result.nickname, "Lewis");
  assert.equal(result.weightKg, 76);
  assert.deepEqual({
    age: result.age, sex: result.sex, heightCm: result.heightCm,
    activityLevel: result.activityLevel, trainingDays: result.trainingDays,
  }, { age: 28, sex: "male", heightCm: 175, activityLevel: "moderate", trainingDays: 4 });
  assert.deepEqual(filters, [["profiles", "id", "user-1"]]);
});
