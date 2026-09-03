import assert from "node:assert/strict";
import test from "node:test";
import {
  AiModelConfigError,
  normalizeAiModelConfig,
  redactAiModelConfig,
  createAiModelConfigService,
} from "./ai-model-config-service.cjs";

const base = {
  providerKey: "custom-text",
  modelKey: "custom-model-v1",
  displayName: "Custom model",
  apiKeyEnv: "CUSTOM_API_KEY",
  baseUrl: "https://example.test/v1",
  endpoint: "/chat/completions",
  protocol: "openai-chat-completions",
  timeoutMs: 12000,
  maxTokens: 2048,
  temperature: 0.2,
  enabled: true,
};

test("normalizes a generic provider/model without a fixed provider enum", () => {
  const result = normalizeAiModelConfig(base, { env: { CUSTOM_API_KEY: "secret" } });
  assert.equal(result.providerKey, "custom-text");
  assert.equal(result.modelKey, "custom-model-v1");
  assert.equal(result.apiKeyEnv, "CUSTOM_API_KEY");
  assert.equal(result.apiKeyStatus, "PRESENT");
  assert.equal(result.timeoutMs, 12000);
});

test("rejects raw API keys and invalid environment variable names", () => {
  assert.throws(() => normalizeAiModelConfig({ ...base, apiKey: "secret" }), (error) => error instanceof AiModelConfigError && error.code === "RAW_SECRET_NOT_ALLOWED");
  assert.throws(() => normalizeAiModelConfig({ ...base, apiKeyEnv: "not-a-var" }), (error) => error instanceof AiModelConfigError && error.code === "API_KEY_ENV_INVALID");
});

test("rejects an API key shaped value as a model identifier", () => {
  assert.throws(() => normalizeAiModelConfig({ ...base, modelKey: "sk-not-a-model" }), (error) => error.code === "MODEL_KEY_SECRET_LIKE");
});

test("allows a configured provider to be assigned to food vision", () => {
  assert.doesNotThrow(() => normalizeAiModelConfig({ ...base, providerKey: "deepseek", applications: ["vision"] }));
});

test("enforces safe parameter bounds", () => {
  assert.throws(() => normalizeAiModelConfig({ ...base, timeoutMs: 0 }), (error) => error.code === "MODEL_PARAMETER_INVALID");
  assert.throws(() => normalizeAiModelConfig({ ...base, maxTokens: 0 }), (error) => error.code === "MODEL_PARAMETER_INVALID");
  assert.throws(() => normalizeAiModelConfig({ ...base, temperature: 3 }), (error) => error.code === "MODEL_PARAMETER_INVALID");
});

test("redaction never returns the secret value", () => {
  const row = normalizeAiModelConfig(base, { env: { CUSTOM_API_KEY: "secret-value" } });
  const result = redactAiModelConfig({ ...row, api_key: "secret-value" }, { env: { CUSTOM_API_KEY: "secret-value" }, applications: ["coach", "coach"] });
  assert.equal(result.apiKeyStatus, "PRESENT");
  assert.deepEqual(result.applications, ["coach"]);
  assert.equal(JSON.stringify(result).includes("secret-value"), false);
  assert.equal("apiKey" in result, false);
});

test("redaction accepts a server-side provider credential status without exposing the credential", () => {
  const result = redactAiModelConfig(base, {
    env: {},
    credentialStatus: "PRESENT",
  });
  assert.equal(result.apiKeyStatus, "PRESENT");
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("keeps generic primary and fallback application roles without fixed providers", () => {
  const result = normalizeAiModelConfig({ ...base, applications: ["coach", "nutrition-insight"], routeRoles: { coach: "primary", "nutrition-insight": "fallback", ignored: "unknown" } }, { env: { CUSTOM_API_KEY: "secret" } });
  assert.deepEqual(result.applications, ["coach", "nutrition-insight"]);
  assert.deepEqual(result.routeRoles, { coach: "primary", "nutrition-insight": "fallback" });
  const redacted = redactAiModelConfig({ ...result, metadata: { routeRoles: result.routeRoles } }, { env: { CUSTOM_API_KEY: "secret" } });
  assert.deepEqual(redacted.routeRoles, result.routeRoles);
});

test("declares required capabilities from configured feature routes without depending on provider or model names", () => {
  const result = normalizeAiModelConfig({
    ...base,
    providerKey: "future-provider",
    modelKey: "future-model-v9",
    applications: ["coach"],
    routeRoles: { food_recognition: "fallback" },
    metadata: { capabilities: [] },
  }, { env: { CUSTOM_API_KEY: "secret" } });
  assert.deepEqual(result.applications, ["coach", "food_recognition"]);
  assert.deepEqual(result.metadata.capabilities, ["text", "vision"]);
});

test("persists inferred feature capabilities when an existing model route is saved", async () => {
  let written = null;
  const db = {
    from() {
      return {
        update(row) { written = row; return this; },
        eq() { return this; },
        select() { return this; },
        async single() { return { data: { id: "model-1", ...written }, error: null }; },
      };
    },
  };
  const service = createAiModelConfigService({ db, isAdmin: async () => true });
  await service.updateModel("operator", "model-1", {
    ...base,
    applications: ["coach"],
    routeRoles: { coach: "fallback" },
    metadata: { capabilities: [] },
  });
  assert.deepEqual(written.feature_keys, ["coach"]);
  assert.deepEqual(written.metadata.capabilities, ["text"]);
});

test("records successful model saves with the shared audit result field", async () => {
  let auditInput = null;
  const db = {
    from() {
      return {
        insert(row) { return { select: () => ({ single: async () => ({ data: { id: "model-1", ...row }, error: null }) }) }; },
      };
    },
  };
  const service = createAiModelConfigService({
    db,
    env: { CUSTOM_API_KEY: "configured" },
    isAdmin: async () => true,
    getCredentialStatus: async () => "PRESENT",
    audit: { record: async (input) => { auditInput = input; } },
  });
  await service.createModel("operator", { ...base, applications: ["coach"] });
  assert.equal(auditInput.result, "succeeded");
  assert.equal("outcome" in auditInput, false);
});

test("keeps only supported model capabilities in safe model metadata", () => {
  const result = normalizeAiModelConfig({
    ...base,
    metadata: { capabilities: ["text", "vision", "text", "unsupported"] },
  }, { env: { CUSTOM_API_KEY: "secret" } });
  assert.deepEqual(result.metadata.capabilities, ["text", "vision"]);
  const redacted = redactAiModelConfig(result, { env: { CUSTOM_API_KEY: "secret" } });
  assert.deepEqual(redacted.metadata.capabilities, ["text", "vision"]);
});

test("deletes a model only for an operator and returns an auditable result", async () => {
  let deletedId = null;
  const db = {
    from() {
      return {
        delete() { return this; },
        eq(_field, value) { deletedId = value; return this; },
        select() { return this; },
        async single() { return { data: { id: deletedId }, error: null }; },
      };
    },
  };
  const service = createAiModelConfigService({ db, isAdmin: async (actor) => actor === "operator" });
  await assert.rejects(() => service.deleteModel("visitor", "model-1"), (error) => error.code === "FORBIDDEN");
  assert.deepEqual(await service.deleteModel("operator", "model-1"), { id: "model-1", deleted: true });
});

test("lists runtime-configured models when persisted model records are empty", async () => {
  const db = {
    from() {
      return {
        select() { return this; },
        order() { return this; },
        then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); },
      };
    },
  };
  const service = createAiModelConfigService({
    db,
    env: { DEEPSEEK_API_KEY: "configured" },
    isAdmin: async () => true,
    getCredentialStatus: async () => "PRESENT",
    runtimeCatalog: [{ feature: "coach", provider: "deepseek", model: "deepseek-v4-flash" }],
  });
  const result = await service.listModels("operator");
  assert.equal(result.items.length, 1);
  assert.equal(result.items[0].providerKey, "deepseek");
  assert.equal(result.items[0].modelKey, "deepseek-v4-flash");
  assert.equal(result.items[0].source, "runtime");
  assert.equal(result.items[0].readOnly, true);
});

test("aggregates all runtime feature assignments for one configured model", async () => {
  const db = {
    from() {
      return {
        select() { return this; },
        order() { return this; },
        then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); },
      };
    },
  };
  const service = createAiModelConfigService({
    db,
    isAdmin: async () => true,
    getCredentialStatus: async () => "PRESENT",
    runtimeCatalog: [
      { feature: "coach", provider: "configured-provider", model: "configured-model" },
      { feature: "daily_insight", provider: "configured-provider", model: "configured-model" },
    ],
  });
  const result = await service.listModels("operator");
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0].applications, ["coach", "daily_insight"]);
});
