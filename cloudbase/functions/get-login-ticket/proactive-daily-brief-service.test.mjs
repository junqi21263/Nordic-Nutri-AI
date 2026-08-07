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
  userJourneyStage: "first_week",
  recentThemes: ["consistency"],
};

test("proactive brief prompt makes NOVA a long-term nutrition companion", () => {
  assert.match(PROACTIVE_DAILY_BRIEF_SYSTEM_PROMPT, /长期陪伴/);
  assert.match(PROACTIVE_DAILY_BRIEF_SYSTEM_PROMPT, /userJourneyStage/);
  assert.match(PROACTIVE_DAILY_BRIEF_SYSTEM_PROMPT, /避免连续重复/);
  assert.match(PROACTIVE_DAILY_BRIEF_SYSTEM_PROMPT, /recentTrend/);
  assert.match(PROACTIVE_DAILY_BRIEF_SYSTEM_PROMPT, /同一主题/);
  assert.match(PROACTIVE_DAILY_BRIEF_SYSTEM_PROMPT, /目标语言/);
  assert.match(PROACTIVE_DAILY_BRIEF_SYSTEM_PROMPT, /训练|运动表现/);
});

test("validates the compact three-paragraph proactive brief and rejects unknown themes", () => {
  const valid = {
    greeting: "早上好，Lewis 👋",
    summary: "昨天蛋白完成 69%，今天继续补足。",
    suggestion: "早餐建议：鸡蛋、燕麦和无糖豆浆，贴近你的增益增肌目标。",
    theme: "protein_gap",
  };
  assert.deepEqual(validateProactiveDailyBrief(valid), valid);
  assert.throws(
    () => validateProactiveDailyBrief({ ...valid, theme: "recovery" }),
    /PROACTIVE_DAILY_BRIEF_RETRYABLE/,
  );
});

test("falls back to a dairy-safe protein reminder when the model is unavailable", async () => {
  const service = createProactiveDailyBriefService({
    requestCompletion: async () => { throw new Error("timeout"); },
  });

  const result = await service({ date: "2026-08-07", context: proteinGapContext });

  assert.equal(result.source, "rule_v2");
  assert.equal(result.theme, "protein_gap");
  assert.match(result.suggestion, /豆浆|豆腐/);
  assert.doesNotMatch(result.suggestion, /牛奶/);
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
        suggestion: "早餐建议：鸡蛋、燕麦和无糖豆浆，贴近今天的增益增肌目标。",
        theme: "consistency",
      };
    },
  });

  const result = await service({ date: "2026-08-07", context: proteinGapContext });

  assert.equal(result.source, "deepseek");
  assert.equal(result.model, "deepseek-v4-flash");
  assert.equal(request.context.userJourneyStage, "first_week");
  assert.equal(request.context.today.period, "morning");
  assert.deepEqual(request.context.recentThemes, ["consistency"]);
});
