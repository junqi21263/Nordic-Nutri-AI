import assert from "node:assert/strict";
import test from "node:test";
import {
  ModelRouteError,
  createModelRouteResolver,
} from "./model-route-resolver.cjs";

const rows = [
  {
    provider_key: "deepseek",
    model_key: "deepseek-v4-flash",
    display_name: "DeepSeek Flash",
    feature_keys: ["daily_insight"],
    enabled: true,
    metadata: { capabilities: ["text"], routeRoles: { daily_insight: "fallback" } },
    updated_at: "2026-08-31T10:00:00.000Z",
  },
  {
    provider_key: "qwen",
    model_key: "qwen3-vl-flash",
    display_name: "Qwen Flash",
    feature_keys: ["daily_insight"],
    enabled: true,
    metadata: { capabilities: ["text"], routeRoles: { daily_insight: "primary" } },
    updated_at: "2026-08-31T11:00:00.000Z",
  },
  {
    provider_key: "qwen",
    model_key: "vision-only",
    feature_keys: ["daily_insight"],
    enabled: true,
    metadata: { capabilities: ["vision"], routeRoles: { daily_insight: "primary" } },
  },
  {
    provider_key: "openai",
    model_key: "disabled-model",
    feature_keys: ["daily_insight"],
    enabled: false,
    metadata: { capabilities: ["text"], routeRoles: { daily_insight: "primary" } },
  },
];

test("selects a compatible primary route and exposes fallback candidates without leaking them", async () => {
  const resolver = createModelRouteResolver({
    listConfigs: async () => rows,
    getCredential: async (providerKey) => `${providerKey}-credential`,
  });
  const primary = await resolver.resolve({ feature: "daily_insight" });
  assert.equal(primary.providerKey, "qwen");
  assert.equal(primary.modelKey, "qwen3-vl-flash");
  assert.equal(primary.role, "primary");
  assert.equal(primary.credential, "qwen-credential");

  const candidates = await resolver.resolveCandidates({ feature: "daily_insight" });
  assert.deepEqual(candidates.map((candidate) => `${candidate.providerKey}:${candidate.role}`), ["qwen:primary", "deepseek:fallback"]);
});

test("fails closed when a feature has no compatible routed model", async () => {
  const resolver = createModelRouteResolver({ listConfigs: async () => rows, getCredential: async () => "secret" });
  await assert.rejects(
    () => resolver.resolve({ feature: "food_image_generation" }),
    (error) => error instanceof ModelRouteError && error.code === "MODEL_ROUTE_NOT_CONFIGURED",
  );
});

test("preserves numeric route controls returned by PostgreSQL", async () => {
  const resolver = createModelRouteResolver({
    listConfigs: async () => [{
      provider_key: "custom-provider",
      model_key: "custom-text-1",
      feature_keys: ["coach"],
      enabled: true,
      timeout_ms: "45000",
      max_tokens: "256",
      temperature: "0.35",
      metadata: { capabilities: ["text"] },
    }],
    getCredential: async () => "credential",
  });

  const route = await resolver.resolve({ feature: "coach" });
  assert.equal(route.timeoutMs, 45000);
  assert.equal(route.maxTokens, 256);
  assert.equal(route.temperature, 0.35);
});

test("uses a configured runtime catalog when persisted routes are empty", async () => {
  const resolver = createModelRouteResolver({
    listConfigs: async () => [],
    runtimeCatalog: [{ feature: "coach", provider: "custom-provider", model: "custom-text-v1" }],
    getCredential: async (providerKey) => `${providerKey}-credential`,
  });
  const route = await resolver.resolve({ feature: "coach" });
  assert.equal(route.providerKey, "custom-provider");
  assert.equal(route.modelKey, "custom-text-v1");
  assert.equal(route.credential, "custom-provider-credential");
});

test("does not mix legacy runtime defaults into a feature with persisted routes", async () => {
  const resolver = createModelRouteResolver({
    listConfigs: async () => [{
      provider_key: "configured-provider",
      model_key: "configured-text-v1",
      feature_keys: ["daily_tip"],
      enabled: true,
      metadata: { capabilities: ["text"], routeRoles: { daily_tip: "primary" } },
    }],
    runtimeCatalog: [{ feature: "daily_tip", provider: "legacy-provider", model: "legacy-text-v1" }],
    getCredential: async (providerKey) => `${providerKey}-credential`,
  });

  const candidates = await resolver.resolveCandidates({ feature: "daily_tip" });
  assert.deepEqual(candidates.map((candidate) => `${candidate.providerKey}:${candidate.modelKey}`), [
    "configured-provider:configured-text-v1",
  ]);
});

test("does not use runtime defaults when the persisted store omits a feature", async () => {
  const resolver = createModelRouteResolver({
    listConfigs: async () => [{
      provider_key: "configured-provider",
      model_key: "configured-text-v1",
      feature_keys: ["coach"],
      enabled: true,
      metadata: { capabilities: ["text"], routeRoles: { coach: "primary" } },
    }],
    runtimeCatalog: [{ feature: "daily_tip", provider: "legacy-provider", model: "legacy-text-v1" }],
    getCredential: async () => "credential",
  });

  await assert.rejects(
    () => resolver.resolve({ feature: "daily_tip" }),
    (error) => error instanceof ModelRouteError && error.code === "MODEL_ROUTE_NOT_CONFIGURED",
  );
});

test("infers the required capability from a legacy feature binding", async () => {
  const resolver = createModelRouteResolver({
    listConfigs: async () => [{
      provider_key: "custom-vision-provider",
      model_key: "custom-vision-v1",
      feature_keys: ["vision"],
      enabled: true,
      metadata: { capabilities: [] },
    }],
    getCredential: async () => "credential",
  });

  const route = await resolver.resolve({ feature: "food_recognition" });
  assert.equal(route.providerKey, "custom-vision-provider");
  assert.equal(route.modelKey, "custom-vision-v1");
});
