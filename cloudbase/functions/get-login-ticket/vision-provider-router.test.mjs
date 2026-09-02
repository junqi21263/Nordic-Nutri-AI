import assert from "node:assert/strict";
import test from "node:test";
import { createConfiguredVisionAnalyzer, createRoutedVisionAnalyzer, hasVisionBinding } from "./vision-provider-router.cjs";

test("routed vision uses only explicitly configured compatible candidates", async () => {
  const calls = [];
  const analyze = createRoutedVisionAnalyzer({
    resolver: { resolveCandidates: async ({ feature }) => {
      assert.equal(feature, "food_recognition");
      return [
        { providerKey: "future-provider", modelKey: "future-vision-1", credential: "secret" },
        { providerKey: "fallback-provider", modelKey: "fallback-vision-1", credential: "secret" },
      ];
    } },
    beforeInvoke: async ({ route, feature }) => calls.push(`quota:${feature}:${route.providerKey}`),
    createService: ({ route }) => async () => {
      calls.push(`call:${route.providerKey}:${route.modelKey}`);
      if (route.providerKey === "future-provider") {
        throw Object.assign(new Error("temporary upstream error"), { code: "VISION_RETRYABLE" });
      }
      return { mealName: "早餐", items: [], provider: route.providerKey, model: route.modelKey };
    },
  });

  const result = await analyze({ imageUrl: "https://example.test/food.jpg" });
  assert.deepEqual(calls, [
    "quota:food_recognition:future-provider",
    "call:future-provider:future-vision-1",
    "quota:food_recognition:fallback-provider",
    "call:fallback-provider:fallback-vision-1",
  ]);
  assert.equal(result.provider, "fallback-provider");
  assert.equal(result.model, "fallback-vision-1");
  assert.equal(result.fallbackUsed, true);
});

test("vision router selects the configured provider binding", async () => {
  const calls = [];
  const analyze = createConfiguredVisionAnalyzer({
    db: { from: () => ({ select: async () => ({ data: [{ provider_key: "deepseek", feature_keys: ["vision"], enabled: true }] }) }) },
    adapters: { qwen: async () => calls.push("qwen"), deepseek: async () => { calls.push("deepseek"); return { provider: "deepseek" }; } },
  });
  const result = await analyze({ imageUrl: "https://example.test/food.jpg" });
  assert.deepEqual(calls, ["deepseek"]);
  assert.equal(result.provider, "deepseek");
});

test("vision router checks the candidate quota before the adapter call", async () => {
  const checks = [];
  const analyze = createConfiguredVisionAnalyzer({
    db: { from: () => ({ select: async () => ({ data: [{ provider_key: "deepseek", model_key: "deepseek-v4-flash-vision-exp", feature_keys: ["vision"], enabled: true }] }) }) },
    beforeInvoke: async ({ candidate, feature }) => checks.push({ provider: candidate.provider, model: candidate.model, feature }),
    adapters: { deepseek: async () => ({ provider: "deepseek" }) },
  });
  await analyze({ imageUrl: "https://example.test/food.jpg" });
  assert.deepEqual(checks, [{ provider: "deepseek", model: "deepseek-v4-flash-vision-exp", feature: "vision" }]);
});

test("vision router supports PostgreSQL array text and route role bindings", () => {
  assert.equal(hasVisionBinding({ feature_keys: "{vision,coach}" }), true);
  assert.equal(hasVisionBinding({ feature_keys: [], metadata: { routeRoles: { vision: "primary" } } }), true);
  assert.equal(hasVisionBinding({ feature_keys: ["coach"] }), false);
});

test("vision router prefers an explicit primary binding over a fallback binding", async () => {
  const calls = [];
  const analyze = createConfiguredVisionAnalyzer({
    db: { from: () => ({ select: async () => ({ data: [
      { provider_key: "qwen", feature_keys: [], metadata: { routeRoles: { vision: "fallback" } }, enabled: true },
      { provider_key: "deepseek", feature_keys: [], metadata: { routeRoles: { vision: "primary" } }, enabled: true },
    ] }) }) },
    adapters: { qwen: async () => calls.push("qwen"), deepseek: async () => { calls.push("deepseek"); return { provider: "deepseek" }; } },
  });
  await analyze({ imageUrl: "https://example.test/food.jpg" });
  assert.deepEqual(calls, ["deepseek"]);
});

test("DeepSeek timeout falls back to the configured Qwen vision adapter", async () => {
  const calls = [];
  const analyze = createConfiguredVisionAnalyzer({
    db: { from: () => ({ select: async () => ({ data: [
      { provider_key: "deepseek", feature_keys: ["vision"], metadata: { routeRoles: { vision: "primary" } }, enabled: true },
    ] }) }) },
    fallbackProvider: "deepseek",
    adapters: {
      deepseek: async () => { calls.push("deepseek"); throw Object.assign(new Error("timeout"), { code: "VISION_TIMEOUT" }); },
      qwen: async () => { calls.push("qwen"); return { provider: "qwen", model: "qwen3-vl-flash" }; },
    },
  });
  const result = await analyze({ imageUrl: "https://example.test/food.jpg" });
  assert.deepEqual(calls, ["deepseek", "qwen"]);
  assert.equal(result.provider, "qwen");
});

test("vision router uses a configured third-party candidate without a provider-name branch", async () => {
  const calls = [];
  const analyze = createConfiguredVisionAnalyzer({
    db: { from: () => ({ select: async () => ({ data: [
      { provider_key: "deepseek", model_key: "deepseek-v4-flash-vision-exp", feature_keys: [], metadata: { routeRoles: { vision: "primary" }, vision: { priority: 100 } }, enabled: true },
      { provider_key: "acme", model_key: "acme-vision-1", feature_keys: [], metadata: { routeRoles: { vision: "fallback" }, vision: { priority: 50 } }, enabled: true },
    ] }) }) },
    adapters: {
      deepseek: async () => { calls.push("deepseek"); throw Object.assign(new Error("temporary"), { code: "VISION_RETRYABLE" }); },
      acme: async () => { calls.push("acme"); return { provider: "acme", model: "acme-vision-1" }; },
    },
  });
  const result = await analyze({ imageUrl: "https://example.test/food.jpg" });
  assert.deepEqual(calls, ["deepseek", "acme"]);
  assert.equal(result.provider, "acme");
  assert.equal(result.model, "acme-vision-1");
  assert.equal(result.fallbackUsed, true);
});
