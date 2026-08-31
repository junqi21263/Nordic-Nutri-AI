import assert from "node:assert/strict";
import test from "node:test";
import {
  AiProviderCatalogError,
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

test("unknown vendors and malformed official payloads fail closed", () => {
  assert.throws(() => normalizeVendorModels("unknown", { data: [] }), (error) => error instanceof AiProviderCatalogError && error.code === "PROVIDER_UNSUPPORTED");
  assert.throws(() => normalizeVendorModels("deepseek", { data: null }), (error) => error instanceof AiProviderCatalogError && error.code === "MODEL_CATALOG_INVALID");
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
