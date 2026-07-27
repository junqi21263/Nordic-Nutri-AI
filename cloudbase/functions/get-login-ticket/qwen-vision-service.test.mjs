import assert from "node:assert/strict";
import test from "node:test";

import { createQwenVisionService, shouldEscalate, PublicQwenVisionError } from "./qwen-vision-service.cjs";

const result = (overrides = {}) => ({
  mealName: "鸡胸肉沙拉", mealType: "lunch", confidence: 0.9, portionConfidence: 0.9,
  needsEscalation: false, uncertaintyReasons: [], advice: "优先补充蛋白质。",
  items: [{ name: "鸡胸肉", quantityG: 120, caloriesPer100g: 133, proteinPer100g: 24, carbsPer100g: 0, fatPer100g: 3 }],
  ...overrides,
});

test("uses flash for a clear simple meal", async () => {
  const calls = [];
  const service = createQwenVisionService({
    apiKey: "qwen-test",
    requestCompletion: async ({ model }) => { calls.push(model); return result(); },
  });
  const output = await service({ imageUrl: "https://example.com/meal.jpg" });
  assert.deepEqual(calls, ["qwen3-vl-flash"]);
  assert.equal(output.model, "qwen3-vl-flash");
  assert.equal(output.provider, "qwen");
});

test("upgrades uncertain multi-item recognition to plus", async () => {
  const calls = [];
  const service = createQwenVisionService({
    apiKey: "qwen-test",
    requestCompletion: async ({ model }) => {
      calls.push(model);
      return calls.length === 1 ? result({ confidence: 0.45, needsEscalation: true, uncertaintyReasons: ["遮挡"], items: [result().items[0], { ...result().items[0], name: "米饭" }, { ...result().items[0], name: "西兰花" }, { ...result().items[0], name: "鸡蛋" }] }) : result({ confidence: 0.82 });
    },
  });
  const output = await service({ imageUrl: "https://example.com/meal.jpg" });
  assert.deepEqual(calls, ["qwen3-vl-flash", "qwen3-vl-plus"]);
  assert.equal(output.model, "qwen3-vl-plus");
});

test("escalation predicate covers low confidence and unclear portions", () => {
  assert.equal(shouldEscalate(result({ confidence: 0.5 })), true);
  assert.equal(shouldEscalate(result({ portionConfidence: 0.4 })), true);
  assert.equal(shouldEscalate(result({ confidence: 0.7, items: [result().items[0], { ...result().items[0], name: "米饭" }, { ...result().items[0], name: "西兰花" }, { ...result().items[0], name: "鸡蛋" }] })), false);
  assert.equal(shouldEscalate(result()), false);
});

test("skips plus escalation for large data-URL payloads", async () => {
  const calls = [];
  const service = createQwenVisionService({
    apiKey: "qwen-test",
    requestCompletion: async ({ model }) => {
      calls.push(model);
      return result({ confidence: 0.4, needsEscalation: true });
    },
  });
  const output = await service({ imageUrl: "data:image/jpeg;base64,/9j/aaaa" });
  assert.deepEqual(calls, ["qwen3-vl-flash"]);
  assert.equal(output.model, "qwen3-vl-flash");
});

test("sends the workspace header for the default flash model", async () => {
  let request;
  const service = createQwenVisionService({
    apiKey: "qwen-test",
    workspaceId: "llm-test",
    fetchImpl: async (url, options) => {
      request = { url, options, body: JSON.parse(options.body) };
      return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(result()) } }] }) };
    },
  });
  await service({ imageUrl: "https://example.com/meal.jpg" });
  assert.equal(request.url, "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions");
  assert.equal(request.options.headers["X-DashScope-WorkSpace"], "llm-test");
  assert.equal(request.body.model, "qwen3-vl-flash");
  assert.equal(request.body.enable_thinking, undefined);
});

test("throws VISION_NON_FOOD when model reports isFood=false", async () => {
  const service = createQwenVisionService({
    apiKey: "qwen-test",
    requestCompletion: async () => ({ isFood: false }),
  });
  await assert.rejects(
    service({ imageUrl: "https://example.com/landscape.jpg" }),
    (err) => err instanceof PublicQwenVisionError && err.code === "VISION_NON_FOOD" && err.message.includes("非食物"),
  );
});
