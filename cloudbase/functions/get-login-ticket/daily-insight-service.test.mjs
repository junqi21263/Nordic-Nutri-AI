import assert from "node:assert/strict";
import test from "node:test";

import {
  DAILY_INSIGHT_SYSTEM_PROMPT,
  createCloudbaseDailyInsightCompletion,
  createDailyInsightService,
  createRuleInsight,
  validateDailyInsight,
} from "./daily-insight-service.cjs";

const context = {
  goalType: "muscle_gain",
  daily: {
    targets: { calories: 2400, protein: 180, carbs: 300, fat: 70 },
    consumed: { calories: 1200, protein: 100, carbs: 130, fat: 35 },
    remaining: { calories: 1200, protein: 80, carbs: 170, fat: 35 },
    mealCount: 2,
    mealTypes: ["breakfast", "lunch"],
    mealNames: ["燕麦鸡蛋", "鸡胸肉糙米饭"],
  },
};

test("daily insight prompt requires evidence, one priority, and an actionable next step", () => {
  assert.match(DAILY_INSIGHT_SYSTEM_PROMPT, /nutritionContext 是唯一权威营养事实/);
  assert.match(DAILY_INSIGHT_SYSTEM_PROMPT, /只选择一个最优先方向/);
  assert.match(DAILY_INSIGHT_SYSTEM_PROMPT, /下一步行动/);
  assert.match(DAILY_INSIGHT_SYSTEM_PROMPT, /不得诊断/);
  assert.match(DAILY_INSIGHT_SYSTEM_PROMPT, /preferences/);
  assert.match(DAILY_INSIGHT_SYSTEM_PROMPT, /foodAvoidances/);
});

test("empty-day rule insight mentions diet preferences when present", () => {
  const insight = createRuleInsight({
    daily: {
      targets: { calories: 2450, protein: 150, carbs: 280, fat: 80 },
      consumed: { calories: 0, protein: 0, carbs: 0, fat: 0 },
      remaining: { calories: 2450, protein: 150, carbs: 280, fat: 80 },
      mealCount: 0,
    },
    preferences: {
      dietaryPattern: "none",
      dietaryPatternLabel: "无特殊",
      foodAvoidanceLabels: ["辛辣食物"],
      mealsPerDay: 3,
    },
  });
  assert.equal(insight.focus, "logging");
  assert.match(insight.headline, /辛辣/);
  assert.match(insight.content, /忌辛辣食物/);
});

test("validates bounded daily insight payloads", () => {
  assert.deepEqual(validateDailyInsight({
    focus: "protein",
    headline: "晚餐优先补蛋白",
    content: "你今天已记录 2 餐，还差约 80g 蛋白质；晚餐先安排鱼、鸡胸肉或豆腐，再配蔬菜和主食。",
  }), {
    focus: "protein",
    headline: "晚餐优先补蛋白",
    content: "你今天已记录 2 餐，还差约 80g 蛋白质；晚餐先安排鱼、鸡胸肉或豆腐，再配蔬菜和主食。",
  });
});

test("rejects presentation markup and answer prefixes in daily insight text", () => {
  assert.throws(
    () => validateDailyInsight({ focus: "protein", headline: "**回复**", content: "建议：下一餐补充蛋白质。" }),
    /DAILY_INSIGHT_RETRYABLE/,
  );
});

test("daily insight uses the enabled CloudBase text model without exposing a vendor key", async () => {
  const calls = [];
  const complete = createCloudbaseDailyInsightCompletion({
    ai: {
      createModel(groupName) {
        calls.push({ groupName });
        return {
          generateText: async (input) => {
            calls.push(input);
            return { text: '{"focus":"protein","headline":"晚餐优先补蛋白","content":"还差约80g蛋白质，晚餐先安排鱼、鸡胸肉或豆腐。"}' };
          },
        };
      },
    },
    model: "hy3",
  });

  const result = await complete({ date: "2026-07-20", context });

  assert.equal(calls[0].groupName, "cloudbase");
  assert.equal(calls[1].model, "hy3");
  assert.equal(calls[1].messages[0].role, "system");
  assert.equal(typeof result, "object");
  assert.equal(typeof result.content, "string");
  assert.match(result.content, /晚餐优先补蛋白/);
});

test("daily insight falls back to an exact record-aware recommendation when the provider fails", async () => {
  const service = createDailyInsightService({
    requestCompletion: async () => { throw new Error("timeout"); },
  });

  const insight = await service({ date: "2026-07-20", context });

  assert.equal(insight.focus, "protein");
  assert.match(insight.content, /已记录 2 餐/);
  assert.match(insight.content, /80g 蛋白质/);
  assert.equal(insight.source, "rule_v3");
  assert.equal(insight.model, null);
});
