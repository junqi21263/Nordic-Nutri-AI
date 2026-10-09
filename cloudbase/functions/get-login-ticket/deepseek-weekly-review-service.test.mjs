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
        headline: "NOVA 本周观察",
        summary: context.allowedCopy.summary[0],
        strengths: [context.allowedCopy.strengths[0]],
        nextSteps: [context.allowedCopy.nextSteps[0]],
      });
    },
  });

  const result = await service({ date: "2026-07-20", context: weeklyReviewContext(review) });
  assert.equal(result.source, "deepseek");
  assert.equal(result.model, "deepseek-v4-pro");
  assert.equal(result.headline, "NOVA 本周观察");
  assert.equal(result.nextSteps[0], "下周每天至少记录一餐");
});

test("keeps the effective routed provider as the review source", async () => {
  const service = createDeepseekWeeklyReviewService({
    model: "qwen-plus",
    source: "qwen",
    requestCompletion: async ({ context }) => JSON.stringify({
      headline: "记录节奏稳定",
      summary: context.allowedCopy.summary[0],
      strengths: [context.allowedCopy.strengths[0]],
      nextSteps: [context.allowedCopy.nextSteps[0]],
    }),
  });
  const result = await service({ date: "2026-07-20", context: weeklyReviewContext(review) });
  assert.equal(result.source, "qwen");
  assert.equal(result.model, "qwen-plus");
});

test("uses V4 Flash when no weekly-review model is supplied", async () => {
  const service = createDeepseekWeeklyReviewService({
    requestCompletion: async ({ context }) => JSON.stringify({
      headline: "记录节奏稳定",
      summary: context.allowedCopy.summary[0],
      strengths: [context.allowedCopy.strengths[0]],
      nextSteps: [context.allowedCopy.nextSteps[0]],
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
  assert.match(result.strengths[0], /5\s*天/);
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
  assert.match(result.summary, /记录还不足/);
  assert.match(result.summary, /未记录不代表没有吃饭/);
});

test("rule fallback avoids nutrition conclusions for sparse weeks", () => {
  const insight = createFallbackWeeklyReview(weeklyReviewContext({
    ...review,
    recordedDays: 2,
    recordedMeals: 2,
    calorieCompletion: 4,
    proteinCompletion: 6,
    score: 13,
  }));
  assert.equal(insight.source, "rule_v1");
  assert.doesNotMatch(insight.summary, /4%|6%|不足摄入/);
  assert.match(insight.summary, /无法可靠评估/);
  assert.match(insight.nextSteps[0], /每天至少记录一餐/);
});
