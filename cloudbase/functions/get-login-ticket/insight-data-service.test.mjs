import assert from "node:assert/strict";
import test from "node:test";

import { createDailyInsightHash } from "./daily-insight-service.cjs";
import { createInsightDataService, dailyInsightContext } from "./insight-data-service.cjs";
import { createWeeklyReviewHash, weeklyReviewContext } from "./deepseek-weekly-review-service.cjs";

const meals = [
  { id: "meal-1", recordedAt: "2026-07-20T08:00:00.000Z", caloriesKcal: 500, proteinG: 40, carbsG: 50, fatG: 15 },
  { id: "meal-2", recordedAt: "2026-07-20T12:00:00.000Z", caloriesKcal: 700, proteinG: 60, carbsG: 80, fatG: 20 },
  { id: "meal-3", recordedAt: "2026-07-18T12:00:00.000Z", caloriesKcal: 600, proteinG: 50, carbsG: 70, fatG: 18 },
];

function createService({ clock = () => new Date("2026-07-20T09:30:00.000Z") } = {}) {
  return createInsightDataService({
    listMealsRange: async (_userId, from, to) => meals.filter((meal) => meal.recordedAt.slice(0, 10) >= from && meal.recordedAt.slice(0, 10) <= to),
    getNutritionPlan: async () => ({ calories: 2400, proteinG: 180, carbsG: 300, fatG: 70 }),
    clock,
  });
}

function createCachedInsightService({
  generateDailyInsight,
  initialCache = null,
  settings = null,
} = {}) {
  let cache = initialCache;
  const db = {
    from(table) {
      if (table === "user_settings") {
        const query = {
          select() { return query; },
          eq() { return query; },
          async maybeSingle() { return { data: settings, error: null }; },
        };
        return query;
      }
      assert.equal(table, "daily_nutrition_insights");
      const query = {
        select() { return query; },
        eq() { return query; },
        async maybeSingle() { return { data: cache, error: null }; },
        async upsert(row, options) {
          assert.equal(options.onConflict, "user_id,insight_date");
          cache = { ...row };
          return { error: null };
        },
      };
      return query;
    },
  };
  return createInsightDataService({
    db,
    listMealsRange: async (_userId, from, to) => meals.filter((meal) => meal.recordedAt.slice(0, 10) >= from && meal.recordedAt.slice(0, 10) <= to),
    getNutritionPlan: async () => ({ calories: 2400, proteinG: 180, carbsG: 300, fatG: 70 }),
    generateDailyInsight,
    clock: () => new Date("2026-07-20T09:30:00.000Z"),
  });
}

function createWeeklyCacheService({ generateWeeklyReview, initialCache = null, weeklyReviewModel = null }) {
  let cache = initialCache;
  const db = {
    from(table) {
      assert.equal(table, "weekly_nutrition_reviews");
      const query = {
        select() { return query; },
        eq() { return query; },
        async maybeSingle() { return { data: cache, error: null }; },
        async upsert(row, options) {
          assert.equal(options.onConflict, "user_id,end_date");
          cache = { ...row };
          return { error: null };
        },
      };
      return query;
    },
  };
  return createInsightDataService({
    db,
    listMealsRange: async (_userId, from, to) => meals.filter((meal) => meal.recordedAt.slice(0, 10) >= from && meal.recordedAt.slice(0, 10) <= to),
    getNutritionPlan: async () => ({ calories: 2400, proteinG: 180, carbsG: 300, fatG: 70 }),
    generateWeeklyReview,
    weeklyReviewModel,
    clock: () => new Date("2026-07-20T09:30:00.000Z"),
  });
}

test("calculates a daily nutrition summary from persisted meals and the active plan", async () => {
  const result = await createService().getDailySummary("user-1", "2026-07-20");

  assert.deepEqual(result.targets, { calories: 2400, protein: 180, carbs: 300, fat: 70 });
  assert.deepEqual(result.consumed, { calories: 1200, protein: 100, carbs: 130, fat: 35 });
  assert.deepEqual(result.remaining, { calories: 1200, protein: 80, carbs: 170, fat: 35 });
  assert.equal(result.completion, 50);
  assert.equal(result.serverTime, "2026-07-20T09:30:00.000Z");
  assert.equal(result.meals.length, 2);
});

test("builds a seven-day review and server-derived achievements", async () => {
  const service = createService();
  const review = await service.getWeeklyReview("user-1", "2026-07-20");
  const achievements = await service.getAchievements("user-1", "2026-07-20");

  assert.equal(review.startDate, "2026-07-20");
  assert.equal(review.endDate, "2026-07-20");
  assert.equal(review.recordedMeals, 2);
  assert.equal(review.recordedDays, 1);
  assert.equal(review.rhythm.length, 7);
  assert.equal(review.rhythm[0].date, "2026-07-20");
  assert.equal(achievements.length, 20);
  assert.equal(achievements[0].unlocked, true);
  assert.equal(achievements[3].unlocked, false);
});

test("unlocks profile completion from the persisted onboarding marker", async () => {
  const service = createInsightDataService({
    listMealsRange: async () => [],
    countMeals: async () => 0,
    getNutritionPlan: async () => null,
    getProfileCompletion: async () => ({
      completed: true,
      completedAt: "2026-07-20T08:00:00.000Z",
    }),
  });

  const achievements = await service.getAchievements("user-1", "2026-07-20");
  const profileCompletion = achievements.find((achievement) => achievement.title === "认识自己");

  assert.equal(profileCompletion?.unlocked, true);
  assert.equal(profileCompletion?.unlockedAt, "2026-07-20T08:00:00.000Z");
});

test("persists one record-aware insight per day and reuses it while the nutrition snapshot is unchanged", async () => {
  let generationCount = 0;
  const service = createCachedInsightService({
    generateDailyInsight: async ({ context }) => {
      generationCount += 1;
      return {
        focus: "protein",
        headline: "晚餐优先补蛋白",
        content: `已记录 ${context.daily.mealCount} 餐，还差 ${context.daily.remaining.protein}g 蛋白质。`,
        source: "hunyuan-exp",
        model: "hunyuan-2.0-instruct-20251111",
      };
    },
  });

  const first = await service.getDailySummaryWithInsight("user-1", "2026-07-20");
  const second = await service.getDailySummaryWithInsight("user-1", "2026-07-20");

  assert.equal(first.insight.cached, false);
  assert.equal(first.insight.content, "已记录 2 餐，还差 80g 蛋白质。");
  assert.equal(second.insight.cached, true);
  assert.equal(second.insight.content, first.insight.content);
  assert.equal(generationCount, 1);
});

test("preferFast still returns a daily summary when insight cache write fails", async () => {
  const service = createInsightDataService({
    db: {
      from(table) {
        assert.equal(table, "daily_nutrition_insights");
        const query = {
          select() { return query; },
          eq() { return query; },
          async maybeSingle() { return { data: null, error: null }; },
          async upsert() { return { error: { message: "relation does not exist" } }; },
        };
        return query;
      },
    },
    listMealsRange: async () => [],
    getNutritionPlan: async () => ({ calories: 2600, proteinG: 150, carbsG: 280, fatG: 80 }),
    clock: () => new Date("2026-08-03T04:00:00.000Z"),
  });

  const summary = await service.getDailySummaryWithInsight("user-1", "2026-08-03", { preferFast: true });
  assert.equal(summary.date, "2026-08-03");
  assert.equal(summary.insight.source, "rule_v3");
  assert.equal(summary.targets.calories, 2600);
  assert.equal(summary.consumed.calories, 0);
});

test("returns daily summary with defaults when nutrition plan read fails", async () => {
  const service = createInsightDataService({
    db: {
      from() {
        const query = {
          select() { return query; },
          eq() { return query; },
          async maybeSingle() { return { data: null, error: null }; },
          async upsert() { return { error: null }; },
        };
        return query;
      },
    },
    listMealsRange: async () => [],
    getNutritionPlan: async () => {
      throw new Error("nutrition plan unavailable");
    },
    clock: () => new Date("2026-08-03T04:00:00.000Z"),
  });

  const summary = await service.getDailySummaryWithInsight("user-1", "2026-08-03", { preferFast: true });
  assert.equal(summary.targets.calories, 2600);
  assert.equal(summary.remaining.calories, 2600);
  assert.equal(summary.insight.source, "rule_v3");
});

test("preferFast returns rule insight immediately and upgrades cache in the background", async () => {
  let generationCount = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const service = createCachedInsightService({
    generateDailyInsight: async ({ context }) => {
      generationCount += 1;
      await gate;
      return {
        focus: "protein",
        headline: "晚餐优先补蛋白",
        content: `已记录 ${context.daily.mealCount} 餐，还差 ${context.daily.remaining.protein}g 蛋白质。`,
        source: "hunyuan-exp",
        model: "hunyuan-2.0-instruct-20251111",
      };
    },
  });

  const first = await service.getDailySummaryWithInsight("user-1", "2026-07-20", { preferFast: true });
  assert.equal(first.insight.source, "rule_v3");
  assert.equal(first.insight.cached, false);
  assert.equal(generationCount, 1);

  release();
  await new Promise((resolve) => setTimeout(resolve, 20));
  const second = await service.getDailySummaryWithInsight("user-1", "2026-07-20", { preferFast: true });
  assert.equal(second.insight.cached, true);
  assert.equal(second.insight.source, "hunyuan-exp");
  assert.equal(second.insight.content, "已记录 2 餐，还差 80g 蛋白质。");
});

test("weekly preferFast skips DeepSeek and does not write a blocking cache miss", async () => {
  const denseMeals = [
    { id: "m1", recordedAt: "2026-07-14T12:00:00.000Z", caloriesKcal: 600, proteinG: 50, carbsG: 70, fatG: 18 },
    { id: "m2", recordedAt: "2026-07-15T12:00:00.000Z", caloriesKcal: 600, proteinG: 50, carbsG: 70, fatG: 18 },
    { id: "m3", recordedAt: "2026-07-16T12:00:00.000Z", caloriesKcal: 600, proteinG: 50, carbsG: 70, fatG: 18 },
    { id: "m4", recordedAt: "2026-07-18T12:00:00.000Z", caloriesKcal: 600, proteinG: 50, carbsG: 70, fatG: 18 },
    { id: "m5", recordedAt: "2026-07-20T12:00:00.000Z", caloriesKcal: 700, proteinG: 60, carbsG: 80, fatG: 20 },
  ];
  let generationCount = 0;
  let cache = null;
  const db = {
    from(table) {
      assert.equal(table, "weekly_nutrition_reviews");
      const query = {
        select() { return query; },
        eq() { return query; },
        async maybeSingle() { return { data: cache, error: null }; },
        async upsert(row) {
          cache = { ...row };
          return { error: null };
        },
      };
      return query;
    },
  };
  const service = createInsightDataService({
    db,
    listMealsRange: async (_userId, from, to) => denseMeals.filter((meal) => meal.recordedAt.slice(0, 10) >= from && meal.recordedAt.slice(0, 10) <= to),
    getNutritionPlan: async () => ({ calories: 2400, proteinG: 180, carbsG: 300, fatG: 70 }),
    generateWeeklyReview: async () => {
      generationCount += 1;
      return {
        headline: "不应出现",
        summary: "preferFast 不应调用模型",
        strengths: ["x"],
        nextSteps: ["y"],
        source: "deepseek",
        model: "deepseek-v4-pro",
      };
    },
    clock: () => new Date("2026-07-20T09:30:00.000Z"),
  });

  const review = await service.getWeeklyReview("user-1", "2026-07-20", { preferFast: true });
  assert.equal(review.insight.source, "rule_v1");
  assert.equal(generationCount, 0);
  assert.equal(cache, null);
  assert.ok(review.recordedDays >= 1);
});

test("daily insight context includes saved diet preferences for generation", async () => {
  let seenPreferences = null;
  const service = createCachedInsightService({
    settings: {
      dietary_pattern: "none",
      food_avoidances: ["spicy"],
      meals_per_day: 3,
    },
    generateDailyInsight: async ({ context }) => {
      seenPreferences = context.preferences;
      return {
        focus: "logging",
        headline: "忌辛辣也先记一餐",
        content: "今天还没记录；忌辛辣食物，先记下下一餐份量。",
        source: "rule_v3",
        model: null,
      };
    },
  });

  await service.getDailySummaryWithInsight("user-1", "2026-07-20");

  assert.deepEqual(seenPreferences, {
    dietaryPattern: "none",
    dietaryPatternLabel: "无特殊",
    foodAvoidances: ["spicy"],
    foodAvoidanceLabels: ["辛辣食物"],
    mealsPerDay: 3,
  });
});

test("reuses a current DeepSeek cache for the same nutrition snapshot", async () => {
  const summary = await createService().getDailySummary("user-1", "2026-07-20");
  let generationCount = 0;
  const service = createCachedInsightService({
    initialCache: {
      context_hash: createDailyInsightHash(dailyInsightContext(summary)),
      payload: { focus: "protein", headline: "旧洞察", content: "这是旧的 DeepSeek 洞察。" },
      provider: "deepseek",
      model: "deepseek-v4-flash",
    },
    generateDailyInsight: async () => {
      generationCount += 1;
      return { focus: "protein", headline: "新洞察", content: "不应重新生成。", source: "deepseek", model: "deepseek-v4-flash" };
    },
  });

  const result = await service.getDailySummaryWithInsight("user-1", "2026-07-20");

  assert.equal(generationCount, 0);
  assert.equal(result.insight.cached, true);
  assert.equal(result.insight.source, "deepseek");
  assert.equal(result.insight.content, "这是旧的 DeepSeek 洞察。");
});

test("persists dev hunyuan-exp metadata for a generated daily insight", async () => {
  const service = createCachedInsightService({
    generateDailyInsight: async () => ({
      focus: "protein",
      headline: "晚餐优先补蛋白",
      content: "还差约20g蛋白质，晚餐可加一份鱼或豆腐。",
      source: "hunyuan-exp",
      model: "hunyuan-2.0-instruct-20251111",
    }),
  });

  const result = await service.getDailySummaryWithInsight("user-1", "2026-07-20");

  assert.equal(result.insight.source, "hunyuan-exp");
  assert.equal(result.insight.model, "hunyuan-2.0-instruct-20251111");
});

test("replaces a same-day main-cloudbase cache after the dev migration", async () => {
  const summary = await createService().getDailySummary("user-1", "2026-07-20");
  let generationCount = 0;
  const service = createCachedInsightService({
    initialCache: {
      context_hash: createDailyInsightHash(dailyInsightContext(summary)),
      payload: { focus: "protein", headline: "旧洞察", content: "这是主环境 hy3 洞察。" },
      provider: "cloudbase",
      model: "hy3",
    },
    generateDailyInsight: async () => {
      generationCount += 1;
      return { focus: "protein", headline: "新洞察", content: "这是 dev 免费 Token 洞察。", source: "hunyuan-exp", model: "hunyuan-2.0-instruct-20251111" };
    },
  });

  const result = await service.getDailySummaryWithInsight("user-1", "2026-07-20");

  assert.equal(generationCount, 1);
  assert.equal(result.insight.cached, false);
  assert.equal(result.insight.source, "hunyuan-exp");
});

test("uses rule weekly insight without DeepSeek when recorded days are sparse", async () => {
  let generationCount = 0;
  const service = createWeeklyCacheService({
    generateWeeklyReview: async () => {
      generationCount += 1;
      return {
        headline: "不应出现",
        summary: "稀疏周不应调用模型",
        strengths: ["x"],
        nextSteps: ["y"],
        source: "deepseek",
        model: "deepseek-v4-pro",
      };
    },
  });

  const first = await service.getWeeklyReview("user-1", "2026-07-20");
  const second = await service.getWeeklyReview("user-1", "2026-07-20");

  assert.equal(first.insight.source, "rule_v1");
  assert.equal(first.insight.cached, false);
  assert.equal(second.insight.cached, true);
  assert.equal(generationCount, 0);
  assert.match(first.insight.summary, /1\s*天/);
});

test("regenerates a weekly review cached with a different model", async () => {
  const denseMeals = [
    { id: "m1", recordedAt: "2026-07-20T12:00:00.000Z", caloriesKcal: 600, proteinG: 50, carbsG: 70, fatG: 18 },
    { id: "m2", recordedAt: "2026-07-21T12:00:00.000Z", caloriesKcal: 600, proteinG: 50, carbsG: 70, fatG: 18 },
    { id: "m3", recordedAt: "2026-07-22T12:00:00.000Z", caloriesKcal: 600, proteinG: 50, carbsG: 70, fatG: 18 },
  ];
  let generationCount = 0;
  const listMealsRange = async (_userId, from, to) => denseMeals.filter((meal) => meal.recordedAt.slice(0, 10) >= from && meal.recordedAt.slice(0, 10) <= to);
  const getNutritionPlan = async () => ({ calories: 2400, proteinG: 180, carbsG: 300, fatG: 70 });
  const clock = () => new Date("2026-07-20T09:30:00.000Z");
  const snapshot = await createInsightDataService({ listMealsRange, getNutritionPlan, clock })
    .getWeeklyReview("user-1", "2026-07-22", { preferFast: true });
  let cache = {
    context_hash: createWeeklyReviewHash(weeklyReviewContext(snapshot)),
    payload: { headline: "旧周回顾", summary: "不应继续复用 V4 Pro 缓存。", strengths: [], nextSteps: [] },
    provider: "deepseek",
    model: "deepseek-v4-pro",
  };
  const db = {
    from(table) {
      assert.equal(table, "weekly_nutrition_reviews");
      const query = {
        select() { return query; },
        eq() { return query; },
        async maybeSingle() { return { data: cache, error: null }; },
        async upsert(row) { cache = { ...row }; return { error: null }; },
      };
      return query;
    },
  };
  const service = createInsightDataService({
    db,
    listMealsRange,
    getNutritionPlan,
    weeklyReviewModel: "deepseek-v4-flash",
    generateWeeklyReview: async () => {
      generationCount += 1;
      return {
        headline: "V4 Flash 周回顾",
        summary: "已通过 V4 Flash 重新生成。",
        strengths: ["完成多日记录"],
        nextSteps: ["继续保持"],
        source: "deepseek",
        model: "deepseek-v4-flash",
      };
    },
    clock,
  });

  const result = await service.getWeeklyReview("user-1", "2026-07-22");

  assert.equal(generationCount, 1);
  assert.equal(result.insight.cached, false);
  assert.equal(result.insight.model, "deepseek-v4-flash");
  assert.equal(cache.model, "deepseek-v4-flash");
});

test("generates and reuses a server-time weekly DeepSeek review cache when enough days exist", async () => {
  const denseMeals = [
    { id: "m1", recordedAt: "2026-07-20T12:00:00.000Z", caloriesKcal: 600, proteinG: 50, carbsG: 70, fatG: 18 },
    { id: "m2", recordedAt: "2026-07-21T12:00:00.000Z", caloriesKcal: 600, proteinG: 50, carbsG: 70, fatG: 18 },
    { id: "m3", recordedAt: "2026-07-22T12:00:00.000Z", caloriesKcal: 600, proteinG: 50, carbsG: 70, fatG: 18 },
    { id: "m4", recordedAt: "2026-07-24T12:00:00.000Z", caloriesKcal: 600, proteinG: 50, carbsG: 70, fatG: 18 },
    { id: "m5", recordedAt: "2026-07-26T12:00:00.000Z", caloriesKcal: 700, proteinG: 60, carbsG: 80, fatG: 20 },
  ];
  let generationCount = 0;
  let cache = null;
  const db = {
    from(table) {
      assert.equal(table, "weekly_nutrition_reviews");
      const query = {
        select() { return query; },
        eq() { return query; },
        async maybeSingle() { return { data: cache, error: null }; },
        async upsert(row, options) {
          assert.equal(options.onConflict, "user_id,end_date");
          cache = { ...row };
          return { error: null };
        },
      };
      return query;
    },
  };
  const service = createInsightDataService({
    db,
    listMealsRange: async (_userId, from, to) => denseMeals.filter((meal) => meal.recordedAt.slice(0, 10) >= from && meal.recordedAt.slice(0, 10) <= to),
    getNutritionPlan: async () => ({ calories: 2400, proteinG: 180, carbsG: 300, fatG: 70 }),
    generateWeeklyReview: async ({ context }) => {
      generationCount += 1;
      assert.ok(context.weekly.recordedDays >= 3);
      return {
        headline: "记录节奏可继续稳定",
        summary: "本周记录较稳定，下一周继续把蛋白质分配到每餐。",
        strengths: ["已记录多天饮食"],
        nextSteps: ["下一周保持每日记录"],
        source: "deepseek",
        model: "deepseek-v4-pro",
      };
    },
    clock: () => new Date("2026-07-20T09:30:00.000Z"),
  });

  const first = await service.getWeeklyReview("user-1", "2026-07-26");
  const second = await service.getWeeklyReview("user-1", "2026-07-26");

  assert.equal(first.serverTime, "2026-07-20T09:30:00.000Z");
  assert.equal(first.serverDate, "2026-07-20");
  assert.equal(first.insight.source, "deepseek");
  assert.equal(first.insight.cached, false);
  assert.equal(second.insight.cached, true);
  assert.equal(generationCount, 1);
});
