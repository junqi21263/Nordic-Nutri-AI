import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createQwenVisionService, shouldEscalate, PublicQwenVisionError } from "./qwen-vision-service.cjs";

test("prompt distinguishes multi-food photos without inventing hidden ingredients", () => {
  const source = readFileSync(new URL("./qwen-vision-service.cjs", import.meta.url), "utf8");
  assert.match(source, /明显包含两个或以上/);
  assert.match(source, /组合菜/);
  assert.match(source, /不得.*凑数量|不要.*凑数量/);
});

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

test("captures a structured flash trace without changing the selected result", async () => {
  let trace;
  const service = createQwenVisionService({
    apiKey: "qwen-test",
    requestCompletion: async () => result(),
  });
  const output = await service({
    imageUrl: "https://example.com/meal.jpg",
    onTrace: (value) => { trace = value; },
  });
  assert.equal(output.mealName, "鸡胸肉沙拉");
  assert.equal(output.model, "qwen3-vl-flash");
  assert.equal(trace.selectedSource, "flash");
  assert.equal(trace.flash.valid, true);
  assert.deepEqual(trace.flash.items, result().items);
  assert.equal(trace.plus.attempted, false);
});

test("upgrades uncertain multi-item recognition to plus", async () => {
  const calls = [];
  let trace;
  const service = createQwenVisionService({
    apiKey: "qwen-test",
    requestCompletion: async ({ model }) => {
      calls.push(model);
      return calls.length === 1 ? result({ confidence: 0.45, needsEscalation: true, uncertaintyReasons: ["遮挡"], items: [result().items[0], { ...result().items[0], name: "米饭" }, { ...result().items[0], name: "西兰花" }, { ...result().items[0], name: "鸡蛋" }] }) : result({ confidence: 0.82 });
    },
  });
  const output = await service({ imageUrl: "https://example.com/meal.jpg", onTrace: (value) => { trace = value; } });
  assert.deepEqual(calls, ["qwen3-vl-flash", "qwen3-vl-plus"]);
  assert.equal(output.model, "qwen3-vl-plus");
  assert.equal(trace.selectedSource, "plus");
  assert.equal(trace.flash.valid, true);
  assert.equal(trace.plus.attempted, true);
  assert.equal(trace.plus.success, true);
  assert.equal(trace.plus.valid, true);
});

test("keeps a valid flash result when plus times out", async () => {
  const calls = [];
  const observations = [];
  let trace;
  const service = createQwenVisionService({
    apiKey: "qwen-test",
    requestCompletion: async ({ model }) => {
      calls.push(model);
      if (calls.length === 1) return result({ confidence: 0.45, needsEscalation: true });
      throw Object.assign(new Error("This operation was aborted"), { name: "AbortError" });
    },
  });
  const output = await service({ imageUrl: "https://example.com/meal.jpg", observe: (event) => observations.push(event), onTrace: (value) => { trace = value; } });
  assert.deepEqual(calls, ["qwen3-vl-flash", "qwen3-vl-plus"]);
  assert.equal(output.model, "qwen3-vl-flash");
  assert.equal(observations.some((event) => event.fallbackReason === "plus_abort"), true);
  assert.equal(trace.selectedSource, "flash");
  assert.equal(trace.plus.attempted, true);
  assert.equal(trace.plus.valid, false);
  assert.equal(trace.plus.fallbackReason, "plus_abort");
});

test("keeps flash when plus returns an invalid schema", async () => {
  let calls = 0;
  const service = createQwenVisionService({
    apiKey: "qwen-test",
    requestCompletion: async () => {
      calls += 1;
      return calls === 1 ? result({ confidence: 0.45, needsEscalation: true }) : { mealName: "不完整" };
    },
  });
  const output = await service({ imageUrl: "https://example.com/meal.jpg" });
  assert.equal(calls, 2);
  assert.equal(output.model, "qwen3-vl-flash");
});

test("skips plus when the mandatory downstream reserve cannot be protected", async () => {
  const calls = [];
  let trace;
  const service = createQwenVisionService({
    apiKey: "qwen-test",
    requestCompletion: async ({ model }) => { calls.push(model); return result({ confidence: 0.45, needsEscalation: true }); },
  });
  const output = await service({
    imageUrl: "https://example.com/meal.jpg",
    budget: { remainingAfterReserve: () => 0, stageTimeout: () => 1_000 },
    onTrace: (value) => { trace = value; },
  });
  assert.deepEqual(calls, ["qwen3-vl-flash"]);
  assert.equal(output.model, "qwen3-vl-flash");
  assert.equal(trace.plus.attempted, false);
  assert.equal(trace.plus.skipReason, "insufficient_budget");
});

test("uses an explicit async provider budget without changing the fast-path cap", async () => {
  const timeouts = [];
  const service = createQwenVisionService({
    apiKey: "qwen-test",
    requestCompletion: async ({ timeoutMs }) => { timeouts.push(timeoutMs); return result(); },
  });
  await service({
    imageUrl: "https://example.com/meal.jpg",
    budget: { providerTimeoutMs: 18_000, remainingMs: () => 20_000 },
  });
  assert.deepEqual(timeouts, [18_000]);
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

test("records provider request timing and sanitized response metadata", async () => {
  const observations = [];
  const service = createQwenVisionService({
    apiKey: "qwen-test",
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: async () => ({ id: "provider-request-1", choices: [{ message: { content: JSON.stringify(result()) } }] }),
    }),
  });

  await service({
    imageUrl: "https://example.com/meal.jpg",
    observe: (event) => observations.push(event),
  });

  const flash = observations.find((event) => event.stage === "flash");
  assert.equal(flash.providerHttpStatus, 200);
  assert.match(flash.providerRequestIdHash, /^[0-9a-f]{64}$/);
  assert.equal(typeof flash.providerRequestDurationMs, "number");
  assert.equal(flash.providerErrorCode, null);
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
