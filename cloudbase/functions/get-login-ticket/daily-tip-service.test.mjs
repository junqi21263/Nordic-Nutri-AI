import test from "node:test";
import assert from "node:assert/strict";
import { createDailyTipService, validateDailyTip } from "./daily-tip-service.cjs";

test("validateDailyTip accepts the three public tip types", () => {
  for (const type of ["nutrition_tip", "food_function", "food_knowledge"]) {
    assert.deepEqual(
      validateDailyTip({ type, headline: "补充深色蔬菜", content: "今天的一餐可以加入一份深色蔬菜。" }),
      { type, headline: "补充深色蔬菜", content: "今天的一餐可以加入一份深色蔬菜。", food: null },
    );
  }
});

test("validateDailyTip rejects unsafe or oversized model output", () => {
  assert.throws(
    () => validateDailyTip({ type: "nutrition_tip", headline: "治疗糖尿病", content: "请用它替代药物。" }),
    /DAILY_TIP_RETRYABLE/,
  );
  assert.throws(
    () => validateDailyTip({ type: "nutrition_tip", headline: "a".repeat(33), content: "有效内容" }),
    /DAILY_TIP_RETRYABLE/,
  );
});

test("service falls back when DeepSeek is unavailable", async () => {
  const service = createDailyTipService({
    contextProvider: async () => ({ daily: { remaining: { protein: 20 } }, goalType: "muscle_gain" }),
    requestCompletion: async () => {
      throw new Error("timeout");
    },
    random: () => 0,
  });
  const result = await service({ date: "2026-07-29" });
  assert.equal(result.source, "rule_v2");
  assert.equal(result.type, "nutrition_tip");
  assert.ok(result.headline);
  assert.ok(result.content);
});

test("service sends only bounded context and returns deepseek result", async () => {
  let request;
  const service = createDailyTipService({
    contextProvider: async () => ({ daily: { remaining: { protein: 20 } }, goalType: "muscle_gain" }),
    requestCompletion: async (input) => {
      request = input;
      return {
        type: "food_function",
        headline: "燕麦的饱腹感",
        content: "燕麦含有膳食纤维，可作为均衡早餐的一部分。",
      };
    },
    random: () => 0.5,
  });
  const result = await service({ date: "2026-07-29" });
  assert.equal(result.source, "deepseek");
  assert.equal(result.type, "food_function");
  assert.equal(request.type, "food_function");
  assert.equal(request.context.goalType, "muscle_gain");
});
