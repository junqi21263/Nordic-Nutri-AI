import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeepseekWeeklyReviewService,
  createFallbackWeeklyReview,
  shouldGenerateWeeklyAi,
  weeklyReviewContext,
} from "./deepseek-weekly-review-service.cjs";

const review = {
  startDate: "2026-07-14",
  endDate: "2026-07-20",
  score: 72,
  recordedMeals: 8,
  recordedDays: 5,
  consistency: 71,
  calorieCompletion: 68,
  proteinCompletion: 76,
  carbsCompletion: 62,
  fatCompletion: 80,
};

test("accepts a bounded structured DeepSeek weekly review", async () => {
  const service = createDeepseekWeeklyReviewService({
    apiKey: "key",
    model: "deepseek-v4-pro",
    requestCompletion: async ({ context }) => {
      assert.equal(context.weekly.score, 72);
      return JSON.stringify({
        headline: "蛋白节奏稳定",
        summary: "本周记录较稳定，下一周继续把蛋白质分配到每餐。",
        strengths: ["记录了5天饮食"],
        nextSteps: ["早餐加入一份高蛋白食物"],
      });
    },
  });

  const result = await service({ date: "2026-07-20", context: weeklyReviewContext(review) });
  assert.equal(result.source, "deepseek");
  assert.equal(result.model, "deepseek-v4-pro");
  assert.equal(result.headline, "蛋白节奏稳定");
  assert.equal(result.nextSteps[0], "早餐加入一份高蛋白食物");
});

test("uses V4 Flash when no weekly-review model is supplied", async () => {
  const service = createDeepseekWeeklyReviewService({
    requestCompletion: async () => JSON.stringify({
      headline: "记录节奏稳定",
      summary: "本周记录较完整，继续保持。",
      strengths: ["已持续记录"],
      nextSteps: ["下周保持每日记录"],
    }),
  });

  const result = await service({ date: "2026-07-20", context: weeklyReviewContext(review) });
  assert.equal(result.model, "deepseek-v4-flash");
});

test("returns safe local content when DeepSeek fails or violates output constraints", async () => {
  const service = createDeepseekWeeklyReviewService({
    apiKey: "key",
    requestCompletion: async () => ({ headline: "**回复**", summary: "不安全" }),
  });
  const result = await service({ date: "2026-07-20", context: weeklyReviewContext(review) });
  assert.equal(result.source, "rule_v1");
  assert.equal(result.model, null);
  assert.match(result.summary, /5\s*天/);
});

test("skips DeepSeek when recorded days are sparse", async () => {
  let called = 0;
  const service = createDeepseekWeeklyReviewService({
    apiKey: "key",
    requestCompletion: async () => {
      called += 1;
      return JSON.stringify({
        headline: "不应出现",
        summary: "不应调用模型",
        strengths: ["x"],
        nextSteps: ["y"],
      });
    },
  });
  const sparse = weeklyReviewContext({ ...review, recordedDays: 2, recordedMeals: 2, score: 13 });
  assert.equal(shouldGenerateWeeklyAi(sparse), false);
  const result = await service({ date: "2026-07-20", context: sparse });
  assert.equal(called, 0);
  assert.equal(result.source, "rule_v1");
  assert.match(result.headline, /记录天数不足|难评估/);
  assert.match(result.summary, /2\s*天/);
});

test("rule fallback encodes completions for sparse weeks", () => {
  const insight = createFallbackWeeklyReview(weeklyReviewContext({
    ...review,
    recordedDays: 2,
    recordedMeals: 2,
    calorieCompletion: 4,
    proteinCompletion: 6,
    score: 13,
  }));
  assert.equal(insight.source, "rule_v1");
  assert.match(insight.summary, /4%/);
  assert.match(insight.nextSteps[0], /每天至少记录一餐/);
});
