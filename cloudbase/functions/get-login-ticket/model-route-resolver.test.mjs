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
