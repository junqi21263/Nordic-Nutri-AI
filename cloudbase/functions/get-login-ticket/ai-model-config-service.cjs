class AiModelConfigError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "AiModelConfigError";
    this.code = code;
  }
}

const { normalizeCapabilities, modelCapabilities, featureCapability } = require("./model-routing-contract.cjs");

const ENV_NAME = /^[A-Z][A-Z0-9_]{0,127}$/;
const KEY = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;

function valueOf(input, camel, snake) {
  return input?.[camel] ?? input?.[snake];
}

function numberOrUndefined(value) {
  if (value === undefined || value === null || value === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : NaN;
}

function normalizeRouteRoles(input = {}) {
  const raw = input.routeRoles ?? input.route_roles ?? input.metadata?.routeRoles ?? input.metadata?.route_roles ?? {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw)
    .map(([feature, role]) => [String(feature).trim(), String(role).trim()])
    .filter(([feature, role]) => feature && (role === "primary" || role === "fallback"))
    .slice(0, 50));
}

function normalizeAiModelConfig(input = {}, { env = process.env, id } = {}) {
  if (input.apiKey !== undefined || input.api_key !== undefined) {
    throw new AiModelConfigError("RAW_SECRET_NOT_ALLOWED", "API key must be referenced by an environment variable");
  }
  const providerKey = String(valueOf(input, "providerKey", "provider_key") ?? "").trim();
  const modelKey = String(valueOf(input, "modelKey", "model_key") ?? "").trim();
  const apiKeyEnv = String(valueOf(input, "apiKeyEnv", "api_key_env") ?? "").trim();
  if (!KEY.test(providerKey)) throw new AiModelConfigError("PROVIDER_KEY_INVALID");
  if (!KEY.test(modelKey)) throw new AiModelConfigError("MODEL_KEY_INVALID");
  if (/^(sk-|key-|api[-_]?key)/i.test(modelKey)) throw new AiModelConfigError("MODEL_KEY_SECRET_LIKE", "模型标识不能是 API Key");
  if (!ENV_NAME.test(apiKeyEnv)) throw new AiModelConfigError("API_KEY_ENV_INVALID");

  const timeoutMs = numberOrUndefined(valueOf(input, "timeoutMs", "timeout_ms"));
  const maxTokens = numberOrUndefined(valueOf(input, "maxTokens", "max_tokens"));
  const temperature = numberOrUndefined(input.temperature);
  if (timeoutMs !== undefined && (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 300000)) {
    throw new AiModelConfigError("MODEL_PARAMETER_INVALID", "timeoutMs must be between 100 and 300000");
  }
  if (maxTokens !== undefined && (!Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > 200000)) {
    throw new AiModelConfigError("MODEL_PARAMETER_INVALID", "maxTokens must be between 1 and 200000");
  }
  if (temperature !== undefined && (temperature < 0 || temperature > 2)) {
    throw new AiModelConfigError("MODEL_PARAMETER_INVALID", "temperature must be between 0 and 2");
  }
  const routeRoles = normalizeRouteRoles(input);
  const rawApplications = input.applications ?? input.featureKeys ?? input.feature_keys ?? [];
  const applications = Array.from(new Set([
    ...(Array.isArray(rawApplications) ? rawApplications : []),
    ...Object.keys(routeRoles),
  ].map((item) => String(item).trim()).filter(Boolean))).slice(0, 50);
  const metadata = input.metadata && typeof input.metadata === "object" && !Array.isArray(input.metadata)
    ? { ...input.metadata }
    : {};
  const featureCapabilities = applications.map(featureCapability).filter(Boolean);
  metadata.capabilities = modelCapabilities({
    modelKey,
    capabilities: [...normalizeCapabilities(metadata.capabilities), ...featureCapabilities],
  });
  return {
    ...(id || valueOf(input, "id", "id") ? { id: id || valueOf(input, "id", "id") } : {}),
    providerKey,
    modelKey,
    displayName: String(valueOf(input, "displayName", "display_name") ?? modelKey).trim().slice(0, 160),
    baseUrl: String(valueOf(input, "baseUrl", "base_url") ?? "").trim().slice(0, 500),
    endpoint: String(input.endpoint ?? "").trim().slice(0, 240),
    protocol: String(input.protocol ?? "").trim().slice(0, 80),
    apiKeyEnv,
    timeoutMs: timeoutMs ?? null,
    maxTokens: maxTokens ?? null,
    temperature: temperature ?? null,
    enabled: input.enabled !== false,
    metadata,
    applications,
    routeRoles,
    apiKeyStatus: env[apiKeyEnv] ? "PRESENT" : "MISSING",
  };
}

function redactAiModelConfig(row = {}, { env = process.env, applications, credentialStatus = null } = {}) {
  const { apiKey: _apiKey, api_key: _apiKeySnake, ...safeRow } = row;
  const normalized = normalizeAiModelConfig(safeRow, { env, id: row.id });
  const storedApplications = row.feature_keys ?? row.featureKeys ?? normalized.applications;
  const routeRoles = normalizeRouteRoles({ ...row, metadata: normalized.metadata });
  return {
    id: normalized.id,
    providerKey: normalized.providerKey,
    modelKey: normalized.modelKey,
    displayName: normalized.displayName,
    baseUrl: normalized.baseUrl,
    endpoint: normalized.endpoint,
    protocol: normalized.protocol,
    apiKeyEnv: normalized.apiKeyEnv,
    apiKeyStatus: credentialStatus === "PRESENT" ? "PRESENT" : normalized.apiKeyStatus,
    timeoutMs: normalized.timeoutMs,
    maxTokens: normalized.maxTokens,
    temperature: normalized.temperature,
    enabled: normalized.enabled,
    metadata: normalized.metadata,
    applications: Array.from(new Set(applications ?? storedApplications ?? [])),
    routeRoles,
    updatedAt: row.updated_at || row.updatedAt || null,
  };
}

function toRow(config, actorUserId) {
  const metadata = { ...config.metadata, routeRoles: config.routeRoles };
  return {
    provider_key: config.providerKey,
    model_key: config.modelKey,
    display_name: config.displayName,
    base_url: config.baseUrl || null,
    endpoint: config.endpoint || null,
    protocol: config.protocol || null,
    api_key_env: config.apiKeyEnv,
    timeout_ms: config.timeoutMs,
    max_tokens: config.maxTokens,
    temperature: config.temperature,
    enabled: config.enabled,
    metadata,
    feature_keys: config.applications,
    updated_by: actorUserId || null,
    updated_at: new Date().toISOString(),
  };
}

function createAiModelConfigService({ db, env = process.env, isAdmin = async () => false, audit = null, getCredentialStatus = async () => null } = {}) {
  async function requireAdmin(actorUserId) {
    if (!(await isAdmin(actorUserId))) throw new AiModelConfigError("FORBIDDEN");
  }
  async function listModels(actorUserId) {
    await requireAdmin(actorUserId);
    const { data, error } = await db.from("ai_model_configs").select("*").order("provider_key").order("model_key");
    if (error) throw new AiModelConfigError("MODEL_CONFIG_READ_FAILED", error.message);
    return {
      items: await Promise.all((data || []).map(async (row) => redactAiModelConfig(row, {
        env,
        credentialStatus: await getCredentialStatus(String(row.provider_key || row.providerKey || "").trim()),
      }))),
    };
  }
  async function saveModel(actorUserId, input, modelId = null) {
    await requireAdmin(actorUserId);
    const config = normalizeAiModelConfig({ ...input, ...(modelId ? { id: modelId } : {}) }, { env, id: modelId || undefined });
    const row = toRow(config, actorUserId);
    let query = db.from("ai_model_configs");
    let result;
    if (modelId) result = await query.update(row).eq("id", modelId).select("*").single();
    else result = await query.insert(row).select("*").single();
    if (result.error) throw new AiModelConfigError("MODEL_CONFIG_WRITE_FAILED", result.error.message);
    const saved = redactAiModelConfig(result.data, {
      env,
      applications: config.applications,
      credentialStatus: await getCredentialStatus(config.providerKey),
    });
    if (audit?.record) await audit.record({ actorUserId, action: modelId ? "ai_model.update" : "ai_model.create", resourceType: "ai_model_config", resourceId: saved.id, outcome: "succeeded" });
    return saved;
  }
  async function deleteModel(actorUserId, modelId) {
    await requireAdmin(actorUserId);
    const id = String(modelId || "").trim();
    if (!id) throw new AiModelConfigError("MODEL_ID_INVALID");
    const result = await db.from("ai_model_configs").delete().eq("id", id).select("id").single();
    if (result.error) {
      const code = /not found|no rows|0 rows/i.test(String(result.error.message || "")) ? "MODEL_NOT_FOUND" : "MODEL_CONFIG_WRITE_FAILED";
      throw new AiModelConfigError(code, result.error.message);
    }
    if (audit?.record) await audit.record({ actorUserId, action: "ai_model.delete", resourceType: "ai_model_config", resourceId: id, outcome: "succeeded" });
    return { id, deleted: true };
  }
  return { listModels, createModel: (actor, input) => saveModel(actor, input), updateModel: (actor, id, input) => saveModel(actor, input, id), deleteModel };
}

module.exports = {
  AiModelConfigError,
  normalizeAiModelConfig,
  redactAiModelConfig,
  createAiModelConfigService,
};
