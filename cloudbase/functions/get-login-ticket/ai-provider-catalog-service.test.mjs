import assert from "node:assert/strict";
import test from "node:test";
import {
  AiProviderCatalogError,
  PROVIDER_REGISTRY,
  createAiProviderCatalogService,
  SYSTEM_MODEL_DEFAULTS,
  listRuntimeCatalog,
  normalizeVendorModels,
  publicProviderStatus,
} from "./ai-provider-catalog-service.cjs";

function createQuery(data = [], error = null) {
  return {
    select() { return this; },
    order() { return this; },
    eq() { return this; },
    limit() { return this; },
    then(resolve) { return Promise.resolve({ data, error }).then(resolve); },
  };
}

test("runtime catalog includes every current AI feature with fixed system defaults", () => {
  const result = listRuntimeCatalog({
    catalog: [
      { feature: "vision", featureLabel: "食物识别", provider: "qwen", model: "qwen3-vl-flash" },
      { feature: "coach", featureLabel: "营养教练", provider: "deepseek", model: "deepseek-v4-flash" },
      { feature: "daily_tip", featureLabel: "每日小贴士", provider: "hunyuan", model: "hunyuan-2.0-instruct" },
    ],
  });
  assert.equal(result.items.length, 3);
  assert.deepEqual(result.items[0].defaults, SYSTEM_MODEL_DEFAULTS);
  assert.deepEqual(result.items.find((item) => item.modelKey === "deepseek-v4-flash").applications, ["coach"]);
});

test("provider status is safe for the browser and never exposes endpoint or secret references", () => {
  const result = publicProviderStatus({
    providerKey: "deepseek",
    credentialStatus: "PRESENT",
    modelCount: 2,
    lastSyncedAt: "2026-08-28T00:00:00.000Z",
  });
  assert.equal(result.providerKey, "deepseek");
  assert.equal(result.credentialStatus, "PRESENT");
  assert.equal("apiKeyEnv" in result, false);
  assert.equal("baseUrl" in result, false);
  assert.equal("endpoint" in result, false);
});

test("official vendor model payload hides non-active models", () => {
  const result = normalizeVendorModels("deepseek", {
    data: [
      { id: "deepseek-v4-flash-vision-exp" },
      { id: "deepseek-old-preview", status: "deprecated" },
      { id: "" },
    ],
  });
  assert.deepEqual(result, [{ providerKey: "deepseek", modelKey: "deepseek-v4-flash-vision-exp", displayName: "deepseek-v4-flash-vision-exp", status: "active", source: "vendor" }]);
});

test("SenseNova model payload accepts both documented and compatible list wrappers", () => {
  const documented = normalizeVendorModels("sensenova", { data: [{ id: "SenseNova-V6.5-Pro", name: "SenseNova V6.5 Pro" }] });
  const wrapped = normalizeVendorModels("sensenova", { data: { models: [{ id: "SenseNova-V6.5-Omni" }] } });
  assert.equal(documented[0].displayName, "SenseNova V6.5 Pro");
  assert.equal(wrapped[0].modelKey, "SenseNova-V6.5-Omni");
});

test("SenseNova Token Plan model payload supports the OpenAI-compatible model list", () => {
  const result = normalizeVendorModels("sensenova", {
    data: [{ id: "sensenova-6.7-flash-lite", object: "model", type: "BASE_MODEL" }],
  });
  assert.equal(result[0].modelKey, "sensenova-6.7-flash-lite");
});

test("unknown vendors and malformed official payloads fail closed", () => {
  assert.throws(() => normalizeVendorModels("unknown", { data: [] }), (error) => error instanceof AiProviderCatalogError && error.code === "PROVIDER_UNSUPPORTED");
  assert.throws(() => normalizeVendorModels("deepseek", { data: null }), (error) => error instanceof AiProviderCatalogError && error.code === "MODEL_CATALOG_INVALID");
});

test("provider registry offers the supported vendor choices", () => {
  for (const providerKey of ["deepseek", "qwen", "hunyuan", "openai", "moonshot", "zhipu", "minimax", "siliconflow", "openrouter", "sensenova"]) {
    assert.ok(PROVIDER_REGISTRY[providerKey], `${providerKey} should be registered`);
    assert.equal(typeof PROVIDER_REGISTRY[providerKey].displayName, "string");
  }
});

test("provider catalog is sourced from runtime configuration before any admin model records exist", async () => {
  const service = createAiProviderCatalogService({
    db: { from: () => createQuery([]) },
    env: { DEEPSEEK_API_KEY: "configured" },
    isAdmin: async () => true,
    modelCatalog: [
      { feature: "coach", provider: "deepseek", model: "deepseek-v4-flash" },
      { feature: "vision", provider: "qwen", model: "qwen3-vl-flash" },
    ],
  });
  const result = await service.listCatalog("admin");
  assert.equal(result.items.length, 2);
  assert.equal(result.items.find((item) => item.providerKey === "deepseek").credentialStatus, "PRESENT");
  assert.equal(JSON.stringify(result).includes("configured"), false);
});

test("raw provider key storage fails closed until the dedicated encryption key is configured", async () => {
  const service = createAiProviderCatalogService({
    db: { from: () => createQuery([]) },
    env: {},
    isAdmin: async () => true,
  });
  await assert.rejects(
    () => service.saveCredential("admin", "deepseek", { apiKey: "sk-example" }),
    (error) => error instanceof AiProviderCatalogError && error.code === "CREDENTIAL_STORE_NOT_CONFIGURED",
  );
});

test("saving the already active environment credential does not require the credential store", async () => {
  let writes = 0;
  const service = createAiProviderCatalogService({
    db: { from: () => ({ upsert: async () => { writes += 1; return { error: null }; } }) },
    env: { QWEN_API_KEY: "active-environment-key" },
    isAdmin: async () => true,
  });
  const result = await service.saveCredential("admin", "qwen", { apiKey: "active-environment-key" });
  assert.equal(result.credentialStatus, "PRESENT");
  assert.equal(writes, 0);
});

test("runtime credential lookup stays server-only and supports configured environment fallback", async () => {
  const service = createAiProviderCatalogService({
    db: { from: () => createQuery([]) },
    env: { QWEN_API_KEY: "qwen-server-secret" },
    isAdmin: async () => false,
  });
  assert.equal(await service.getRuntimeCredential("qwen"), "qwen-server-secret");
  assert.equal("getRuntimeCredential" in (await service.listCatalog("ignored").catch(() => ({}))), false);
});

test("active environment credential wins over a stale saved credential", async () => {
  const service = createAiProviderCatalogService({
    db: { from: () => createQuery([{ provider_key: "deepseek", secret_ciphertext: "stale", secret_iv: "stale", secret_auth_tag: "stale" }]) },
    env: { DEEPSEEK_API_KEY: "active-environment-key", AI_PROVIDER_CREDENTIALS_ENCRYPTION_KEY: "00".repeat(32) },
    isAdmin: async () => false,
  });
  assert.equal(await service.getRuntimeCredential("deepseek"), "active-environment-key");
});

test("provider test tries all configured discovery endpoints and returns safe failure details", async () => {
  const calls = [];
  const service = createAiProviderCatalogService({
    db: { from: () => createQuery([]) },
    env: { SENSENOVA_API_TOKEN: "server-secret" },
    isAdmin: async () => true,
    fetchImpl: async (url) => {
      calls.push(url);
      if (url.includes("token.sensenova.cn")) return { ok: false, status: 404, json: async () => ({ error: { message: "not found" } }) };
      return { ok: true, status: 200, json: async () => ({ data: [] }) };
    },
  });
  const result = await service.testProvider("admin", "sensenova");
  assert.equal(result.providerKey, "sensenova");
  assert.equal(result.status, "OK");
  assert.equal(typeof result.durationMs, "number");
  assert.equal(calls.length, 2);
});
