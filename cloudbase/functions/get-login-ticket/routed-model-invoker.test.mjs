import assert from "node:assert/strict";
import test from "node:test";
import { createRoutedModelInvoker, createRoutedModelStreamInvoker } from "./routed-model-invoker.cjs";

test("cancelled nutrition invocation never starts a fallback model", async () => {
  const controller = new AbortController();
  let attempts = 0;
  const invoke = createRoutedModelInvoker({
    feature: "nutrition_plan",
    getSignal: (_input, options) => options.signal,
    resolver: { resolveCandidates: async () => [
      { providerKey: "deepseek", modelKey: "primary", credential: "key" },
      { providerKey: "deepseek", modelKey: "fallback", credential: "key" },
    ] },
    createService: () => async () => {
      attempts += 1;
      controller.abort();
      throw new Error("cancelled");
    },
  });
  await assert.rejects(invoke({}, { signal: controller.signal }));
  assert.equal(attempts, 1);
});

test("invokes the primary configured route and annotates the effective provider", async () => {
  const invoker = createRoutedModelInvoker({
    feature: "daily_insight",
    resolver: { resolveCandidates: async () => [{ providerKey: "qwen", modelKey: "qwen3-vl-flash", credential: "key", baseUrl: "https://models.example.test/v1" }] },
    fetchImpl: async (url) => ({ ok: true, url }),
    createService: ({ model, source, fetchImpl }) => async () => {
      const response = await fetchImpl("https://api.deepseek.com/chat/completions", { method: "POST", headers: {}, body: JSON.stringify({ model: "legacy", messages: [] }) });
      return { source, model, requestUrl: response.url };
    },
  });
  const result = await invoker({ date: "2026-08-31" });
  assert.equal(result.provider, "qwen");
  assert.equal(result.model, "qwen3-vl-flash");
  assert.equal(result.requestUrl, "https://models.example.test/v1/chat/completions");
  assert.equal(result.fallbackUsed, false);
});

test("uses the configured fallback only after the primary service throws", async () => {
  let attempts = 0;
  const invoker = createRoutedModelInvoker({
    feature: "daily_insight",
    resolver: { resolveCandidates: async () => [
      { providerKey: "qwen", modelKey: "qwen-primary", credential: "key", baseUrl: "https://qwen.example.test/v1", role: "primary" },
      { providerKey: "deepseek", modelKey: "deepseek-fallback", credential: "key", baseUrl: "https://deepseek.example.test/v1", role: "fallback" },
    ] },
    createService: ({ model, source }) => async () => {
      attempts += 1;
      if (source === "qwen") throw new Error("upstream failed");
      return { model, source };
    },
  });
  const result = await invoker({});
  assert.equal(attempts, 2);
  assert.equal(result.provider, "deepseek");
  assert.equal(result.model, "deepseek-fallback");
  assert.equal(result.fallbackUsed, true);
});

test("reports each routed attempt without exposing the credential", async () => {
  const events = [];
  const invoker = createRoutedModelInvoker({
    feature: "daily_insight",
    resolver: { resolveCandidates: async () => [
      { providerKey: "qwen", modelKey: "primary", credential: "secret-primary" },
      { providerKey: "deepseek", modelKey: "fallback", credential: "secret-fallback" },
    ] },
    onAttempt: (event) => events.push(event),
    createService: ({ source }) => async () => {
      if (source === "qwen") throw Object.assign(new Error("upstream timeout"), { code: "MODEL_TIMEOUT" });
      return { ok: true };
    },
  });

  await invoker({});

  assert.deepEqual(events.map(({ phase, provider, model, attempt, errorCode }) => ({ phase, provider, model, attempt, errorCode })), [
    { phase: "started", provider: "qwen", model: "primary", attempt: 0, errorCode: undefined },
    { phase: "failed", provider: "qwen", model: "primary", attempt: 0, errorCode: "MODEL_TIMEOUT" },
    { phase: "started", provider: "deepseek", model: "fallback", attempt: 1, errorCode: undefined },
    { phase: "succeeded", provider: "deepseek", model: "fallback", attempt: 1, errorCode: undefined },
  ]);
});

test("checks the model quota immediately before each provider attempt", async () => {
  const checks = [];
  const invoker = createRoutedModelInvoker({
    feature: "daily_insight",
    resolver: { resolveCandidates: async () => [{ providerKey: "deepseek", modelKey: "deepseek-v4-flash", credential: "key" }] },
    beforeInvoke: async ({ feature, route, attempt }) => checks.push({ feature, providerKey: route.providerKey, modelKey: route.modelKey, attempt }),
    createService: () => async () => ({ ok: true }),
  });
  await invoker({});
  assert.deepEqual(checks, [{ feature: "daily_insight", providerKey: "deepseek", modelKey: "deepseek-v4-flash", attempt: 0 }]);
});

test("streams from the configured fallback when the primary stream fails before output", async () => {
  const stream = createRoutedModelStreamInvoker({
    feature: "coach",
    resolver: { resolveCandidates: async () => [
      { providerKey: "qwen", modelKey: "qwen-primary", credential: "key", baseUrl: "https://qwen.example.test/v1" },
      { providerKey: "deepseek", modelKey: "deepseek-fallback", credential: "key", baseUrl: "https://deepseek.example.test/v1" },
    ] },
    createService: ({ source }) => async function* service() {
      if (source === "qwen") throw new Error("primary unavailable");
      yield { type: "delta", content: "已切换" };
    },
  });
  const events = [];
  for await (const event of stream({ question: "test" })) events.push(event);
  assert.deepEqual(events, [
    { type: "delta", content: "已切换" },
    { type: "route", provider: "deepseek", model: "deepseek-fallback", fallbackUsed: true },
  ]);
});
