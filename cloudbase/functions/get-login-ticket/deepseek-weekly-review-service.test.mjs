import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeepseekWeeklyReviewService,
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
