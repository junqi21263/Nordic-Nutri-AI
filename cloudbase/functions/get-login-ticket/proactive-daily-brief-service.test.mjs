import test from "node:test";
import assert from "node:assert/strict";

import {
  PROACTIVE_DAILY_BRIEF_SYSTEM_PROMPT,
  createProactiveDailyBriefService,
  validateProactiveDailyBrief,
} from "./proactive-daily-brief-service.cjs";

const proteinGapContext = {
  user: { name: "Lewis", goal: "muscle_gain" },
  nutritionGoal: { protein: 130 },
  preference: { dietaryPattern: "均衡饮食", avoidances: ["牛奶"], mealsPerDay: 3 },
  today: { period: "morning", hasMealRecord: false },
  yesterday: { recorded: true, proteinRate: 69, caloriesRate: 86 },
  habit: { continuousDays: 6, weeklyRecordRate: 85 },
  userJourneyStage: "habit_building",
  recentThemes: ["consistency"],
};

test("proactive brief prompt makes NOVA a long-term nutrition companion", () => {
  assert.match(PROACTIVE_DAILY_BRIEF_SYSTEM_PROMPT, /长期陪伴/);
  assert.match(PROACTIVE_DAILY_BRIEF_SYSTEM_PROMPT, /userJourneyStage/);
  assert.match(PROACTIVE_DAILY_BRIEF_SYSTEM_PROMPT, /避免连续重复/);
  assert.match(PROACTIVE_DAILY_BRIEF_SYSTEM_PROMPT, /recentTrend/);
  assert.match(PROACTIVE_DAILY_BRIEF_SYSTEM_PROMPT, /同一主题/);
  assert.match(PROACTIVE_DAILY_BRIEF_SYSTEM_PROMPT, /目标语言/);
  assert.match(PROACTIVE_DAILY_BRIEF_SYSTEM_PROMPT, /new_user/);
  assert.match(PROACTIVE_DAILY_BRIEF_SYSTEM_PROMPT, /首卡.*食物|首卡.*具体食材/);
});

test("validates the compact three-paragraph proactive brief and rejects unknown themes", () => {
  const valid = {
    greeting: "早上好，Lewis 👋",
    summary: "昨天蛋白完成 69%，今天继续补足。",
    suggestion: "今日行动：记录早餐，优先完成今天的蛋白目标。",
    theme: "protein_gap",
  };
  assert.deepEqual(validateProactiveDailyBrief(valid), valid);
  assert.throws(
    () => validateProactiveDailyBrief({ ...valid, theme: "recovery" }),
    /PROACTIVE_DAILY_BRIEF_RETRYABLE/,
  );
});

test("falls back to a food-free action reminder when the model is unavailable", async () => {
  const service = createProactiveDailyBriefService({
    requestCompletion: async () => { throw new Error("timeout"); },
  });

  const result = await service({ date: "2026-08-07", context: proteinGapContext });

  assert.equal(result.source, "rule_v2");
  assert.equal(result.theme, "protein_gap");
  assert.match(result.suggestion, /^今日行动：/);
  assert.doesNotMatch(result.suggestion, /鸡蛋|豆浆|牛奶|燕麦|豆腐/);
  assert.doesNotMatch(result.summary, /欢迎开启营养之旅/);
});

test("passes the stage, period and prior themes to V4 Flash", async () => {
  let request;
  const service = createProactiveDailyBriefService({
    requestCompletion: async (input) => {
      request = input;
      return {
        greeting: "早上好，Lewis 👋",
        summary: "你已连续记录 6 天，节奏正在变稳。",
        suggestion: "今日行动：记录早餐，让今天的饮食节奏更完整。",
        theme: "protein_gap",
      };
    },
  });

  const result = await service({ date: "2026-08-07", context: proteinGapContext });

  assert.equal(result.source, "deepseek");
  assert.equal(result.model, "deepseek-v4-flash");
  assert.equal(request.context.userJourneyStage, "habit_building");
  assert.equal(request.context.today.period, "morning");
  assert.deepEqual(request.context.recentThemes, ["consistency"]);
});

test("does not keep yesterday's theme even when the model repeats it", async () => {
  const service = createProactiveDailyBriefService({
    requestCompletion: async () => ({
      greeting: "早上好，Lewis 👋",
      summary: "你已连续记录 6 天，节奏正在变稳。",
      suggestion: "今日行动：记录早餐，保持今天的连续节奏。",
      theme: "consistency",
    }),
  });

  const result = await service({
    date: "2026-08-07",
    context: { ...proteinGapContext, yesterday: { recorded: true, proteinRate: 90, caloriesRate: 95 } },
  });

  assert.notEqual(result.theme, "consistency");
});

test("preferFast returns the action card before the model completes", async () => {
  let resolveCompletion;
  const service = createProactiveDailyBriefService({
    requestCompletion: () => new Promise((resolve) => { resolveCompletion = resolve; }),
  });

  const immediate = await service({ date: "2026-08-07", context: proteinGapContext, preferFast: true });

  assert.equal(immediate.source, "rule_v2");
  assert.match(immediate.suggestion, /^今日行动：/);
  assert.equal(typeof immediate.upgrade?.then, "function");

  resolveCompletion({
    greeting: "早上好，Lewis 👋",
    summary: "昨天蛋白完成 69%，今天继续补足。",
    suggestion: "今日行动：记录早餐，优先完成今天的蛋白目标。",
    theme: "protein_gap",
  });
  assert.equal((await immediate.upgrade).source, "deepseek");
});
