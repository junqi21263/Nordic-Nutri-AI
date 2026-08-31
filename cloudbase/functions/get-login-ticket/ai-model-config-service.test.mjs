import assert from "node:assert/strict";
import test from "node:test";
import {
  AiModelConfigError,
  normalizeAiModelConfig,
  redactAiModelConfig,
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

test("keeps generic primary and fallback application roles without fixed providers", () => {
  const result = normalizeAiModelConfig({ ...base, applications: ["coach", "nutrition-insight"], routeRoles: { coach: "primary", "nutrition-insight": "fallback", ignored: "unknown" } }, { env: { CUSTOM_API_KEY: "secret" } });
  assert.deepEqual(result.applications, ["coach", "nutrition-insight"]);
  assert.deepEqual(result.routeRoles, { coach: "primary", "nutrition-insight": "fallback" });
  const redacted = redactAiModelConfig({ ...result, metadata: { routeRoles: result.routeRoles } }, { env: { CUSTOM_API_KEY: "secret" } });
  assert.deepEqual(redacted.routeRoles, result.routeRoles);
});
