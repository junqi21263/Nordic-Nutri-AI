import test from "node:test";
import assert from "node:assert/strict";
import {
  COACH_QUICK_PROMPT_SYSTEM_PROMPT,
  DAILY_TIP_SYSTEM_PROMPT,
  createDailyTipService,
  validateCoachQuickPrompt,
  validateDailyTip,
} from "./daily-tip-service.cjs";

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

test("validateDailyTip rejects presentation markup and answer prefixes", () => {
  assert.throws(
    () => validateDailyTip({ type: "nutrition_tip", headline: "**回复**", content: "建议：下一餐加一份鸡蛋。" }),
    /DAILY_TIP_RETRYABLE/,
  );
  assert.throws(
    () => validateCoachQuickPrompt({ prompt: "回复：晚餐怎么补充蛋白质？" }),
    /DAILY_TIP_RETRYABLE/,
  );
});

test("daily-tip prompt requires a contextual decision and a practical action", () => {
  assert.match(DAILY_TIP_SYSTEM_PROMPT, /当天记录中最需要优先补足的一个方向/);
  assert.match(DAILY_TIP_SYSTEM_PROMPT, /具体食物或搭配方式/);
  assert.match(DAILY_TIP_SYSTEM_PROMPT, /避免泛泛而谈/);
});

test("coach-question prompt requires a concrete context and rejects generic wording", () => {
  assert.match(COACH_QUICK_PROMPT_SYSTEM_PROMPT, /当前时间段|下一餐场景|当天营养缺口/);
  assert.match(COACH_QUICK_PROMPT_SYSTEM_PROMPT, /不要生成泛泛问题/);
  assert.throws(
    () => validateCoachQuickPrompt({ prompt: "怎么吃更健康？" }),
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

test("service returns a DeepSeek-generated coach question and uses a safe fallback", async () => {
  const service = createDailyTipService({
    requestCompletion: async ({ purpose }) => {
      if (purpose === "coach_quick_prompt") return { prompt: "下午训练后怎么补充蛋白质？" };
      throw new Error("unexpected purpose");
    },
    random: () => 0,
  });

  const result = await service.getQuickPrompt({
    date: "2026-07-29",
    context: { daily: { remaining: { protein: 20 } } },
  });

  assert.deepEqual(result, {
    prompt: "下午训练后怎么补充蛋白质？",
    source: "deepseek",
    model: "deepseek-v4-flash",
  });
});

test("service preserves dev worker metadata for generated tips and quick prompts", async () => {
  const service = createDailyTipService({
    source: "hunyuan-exp",
    model: "hunyuan-2.0-instruct-20251111",
    requestCompletion: async ({ purpose }) => purpose === "coach_quick_prompt"
      ? { prompt: "晚餐怎么补充蛋白质？" }
      : { type: "nutrition_tip", headline: "下一餐补蛋白", content: "午餐可搭配鸡蛋或豆腐。", food: null },
    random: () => 0,
  });

  const tip = await service({ date: "2026-07-29", context: {} });
  const prompt = await service.getQuickPrompt({ date: "2026-07-29", context: {} });

  assert.equal(tip.source, "hunyuan-exp");
  assert.equal(tip.model, "hunyuan-2.0-instruct-20251111");
  assert.equal(prompt.source, "hunyuan-exp");
  assert.equal(prompt.model, "hunyuan-2.0-instruct-20251111");
});

test("coach question falls back when model output is unsafe", async () => {
  const service = createDailyTipService({
    requestCompletion: async () => ({ prompt: "吃药期间怎么减脂？" }),
    random: () => 0,
  });

  const result = await service.getQuickPrompt({ date: "2026-07-29", context: {} });

  assert.equal(result.source, "rule_v2");
  assert.match(result.prompt, /蛋白|下一餐|加餐/);
});
