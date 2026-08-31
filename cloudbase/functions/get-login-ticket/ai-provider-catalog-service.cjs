const crypto = require("node:crypto");

const SYSTEM_MODEL_DEFAULTS = Object.freeze({
  timeoutMs: 30000,
  maxTokens: 2048,
  temperature: 0.2,
});

const PROVIDER_REGISTRY = Object.freeze({
  deepseek: Object.freeze({
    displayName: "DeepSeek",
    credentialEnvNames: ["DEEPSEEK_API_KEY"],
    modelDiscovery: "official-api",
    modelsEndpoint: "https://api.deepseek.com/models",
  }),
  qwen: Object.freeze({
    displayName: "通义千问",
    credentialEnvNames: ["DASHSCOPE_API_KEY", "QWEN_API_KEY"],
    modelDiscovery: "official-api",
    modelsEndpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
  }),
  hunyuan: Object.freeze({
    displayName: "腾讯混元",
    credentialEnvNames: ["HUNYUAN_API_KEY"],
    modelDiscovery: "cloudbase-runtime",
  }),
  openai: Object.freeze({
    displayName: "OpenAI",
    credentialEnvNames: ["OPENAI_API_KEY"],
    modelDiscovery: "official-api",
    modelsEndpoint: "https://api.openai.com/v1/models",
  }),
  moonshot: Object.freeze({
    displayName: "月之暗面 Moonshot",
    credentialEnvNames: ["MOONSHOT_API_KEY", "KIMI_API_KEY"],
    modelDiscovery: "official-api",
    modelsEndpoint: "https://api.moonshot.cn/v1/models",
  }),
  zhipu: Object.freeze({
    displayName: "智谱 GLM",
    credentialEnvNames: ["ZHIPU_API_KEY", "GLM_API_KEY"],
    modelDiscovery: "official-api",
    modelsEndpoint: "https://open.bigmodel.cn/api/paas/v4/models",
  }),
  minimax: Object.freeze({
    displayName: "MiniMax",
    credentialEnvNames: ["MINIMAX_API_KEY"],
    modelDiscovery: "official-api",
    modelsEndpoint: "https://api.minimaxi.chat/v1/models",
  }),
  siliconflow: Object.freeze({
    displayName: "SiliconFlow",
    credentialEnvNames: ["SILICONFLOW_API_KEY"],
    modelDiscovery: "official-api",
    modelsEndpoint: "https://api.siliconflow.cn/v1/models",
  }),
  openrouter: Object.freeze({
    displayName: "OpenRouter",
    credentialEnvNames: ["OPENROUTER_API_KEY"],
    modelDiscovery: "official-api",
    modelsEndpoint: "https://openrouter.ai/api/v1/models",
  }),
});

class AiProviderCatalogError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "AiProviderCatalogError";
    this.code = code;
  }
}

function requireProvider(providerKey) {
  const provider = PROVIDER_REGISTRY[String(providerKey || "").trim()];
  if (!provider) throw new AiProviderCatalogError("PROVIDER_UNSUPPORTED");
  return provider;
}

function publicProviderStatus({ providerKey, credentialStatus = "MISSING", modelCount = 0, lastSyncedAt = null, discoveryStatus = null } = {}) {
  const provider = requireProvider(providerKey);
  return {
    providerKey,
    displayName: provider.displayName,
    credentialStatus: credentialStatus === "PRESENT" ? "PRESENT" : "MISSING",
    modelCount: Number.isInteger(modelCount) && modelCount >= 0 ? modelCount : 0,
    lastSyncedAt,
    discovery: {
      mode: provider.modelDiscovery,
      status: discoveryStatus || "NOT_SYNCED",
    },
  };
}

function normalizeVendorModels(providerKey, payload) {
  requireProvider(providerKey);
  if (!payload || !Array.isArray(payload.data)) throw new AiProviderCatalogError("MODEL_CATALOG_INVALID");
  return payload.data
    .filter((item) => item && typeof item.id === "string" && item.id.trim() && !["deprecated", "retired", "offline"].includes(String(item.status || "").toLowerCase()))
    .map((item) => {
      const modelKey = item.id.trim();
      return { providerKey, modelKey, displayName: modelKey, status: "active", source: "vendor" };
    })
    .filter((item, index, all) => all.findIndex((candidate) => candidate.modelKey === item.modelKey) === index);
}

function listRuntimeCatalog({ catalog = [] } = {}) {
  const models = new Map();
  for (const item of catalog) {
    if (!item || !item.provider || !item.model) continue;
    const providerKey = String(item.provider).trim();
    const modelKey = String(item.model).trim();
    if (!PROVIDER_REGISTRY[providerKey] || !modelKey) continue;
    const id = `${providerKey}:${modelKey}`;
    const current = models.get(id) || {
      id,
      providerKey,
      modelKey,
      displayName: modelKey,
      status: "active",
      source: "runtime",
      defaults: { ...SYSTEM_MODEL_DEFAULTS },
      applications: [],
    };
    if (item.feature && !current.applications.includes(item.feature)) current.applications.push(item.feature);
    models.set(id, current);
  }
  return { items: [...models.values()].sort((a, b) => a.providerKey.localeCompare(b.providerKey) || a.modelKey.localeCompare(b.modelKey)) };
}

function configuredEnvironmentCredential(env, providerKey) {
  const provider = requireProvider(providerKey);
  return provider.credentialEnvNames
    .map((name) => String(env?.[name] || "").trim())
    .find(Boolean) || null;
}

function encryptionKeyFromEnvironment(env) {
  const source = String(env?.AI_PROVIDER_CREDENTIALS_ENCRYPTION_KEY || "").trim();
  if (!source) throw new AiProviderCatalogError("CREDENTIAL_STORE_NOT_CONFIGURED");
  const key = /^[0-9a-f]{64}$/i.test(source) ? Buffer.from(source, "hex") : Buffer.from(source, "base64");
  if (key.length !== 32) throw new AiProviderCatalogError("CREDENTIAL_STORE_NOT_CONFIGURED");
  return key;
}

function encryptCredential(value, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return {
    secret_ciphertext: ciphertext.toString("base64"),
    secret_iv: iv.toString("base64"),
    secret_auth_tag: cipher.getAuthTag().toString("base64"),
  };
}

function decryptCredential(row, key) {
  if (!row?.secret_ciphertext || !row?.secret_iv || !row?.secret_auth_tag) return null;
  try {
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, Buffer.from(row.secret_iv, "base64"));
    decipher.setAuthTag(Buffer.from(row.secret_auth_tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(row.secret_ciphertext, "base64")), decipher.final()]).toString("utf8");
  } catch {
    throw new AiProviderCatalogError("CREDENTIAL_READ_FAILED");
  }
}

function asError(code, error) {
  if (error instanceof AiProviderCatalogError) throw error;
  throw new AiProviderCatalogError(code);
}

function publicCatalogItem(row, runtimeApplications = []) {
  const providerKey = String(row.provider_key || row.providerKey || "").trim();
  const modelKey = String(row.model_key || row.modelKey || "").trim();
  if (!providerKey || !modelKey || !PROVIDER_REGISTRY[providerKey]) return null;
  return {
    id: `${providerKey}:${modelKey}`,
    providerKey,
    modelKey,
    displayName: String(row.display_name || row.displayName || modelKey),
    status: String(row.status || "active").toLowerCase(),
    source: String(row.source || "vendor"),
    defaults: { ...SYSTEM_MODEL_DEFAULTS },
    applications: [...runtimeApplications],
    lastSyncedAt: row.last_synced_at || row.lastSyncedAt || null,
  };
}

function createAiProviderCatalogService({ db, env = process.env, isAdmin = async () => false, audit = null, modelCatalog = [], fetchImpl = globalThis.fetch } = {}) {
  if (!db?.from) throw new Error("db is required");

  async function requireAdmin(actorUserId) {
    if (!(await isAdmin(actorUserId))) throw new AiProviderCatalogError("FORBIDDEN");
  }

  async function credentialRecord(providerKey) {
    try {
      const result = await db.from("ai_provider_credentials").select("*").eq("provider_key", providerKey).limit(1);
      if (result?.error) throw result.error;
      return result?.data?.[0] || null;
    } catch (error) {
      asError("CREDENTIAL_READ_FAILED", error);
    }
  }

  async function effectiveCredential(providerKey) {
    const saved = await credentialRecord(providerKey);
    if (saved) return decryptCredential(saved, encryptionKeyFromEnvironment(env));
    return configuredEnvironmentCredential(env, providerKey);
  }

  async function credentialStatus(providerKey) {
    if (configuredEnvironmentCredential(env, providerKey)) return "PRESENT";
    try {
      return (await credentialRecord(providerKey)) ? "PRESENT" : "MISSING";
    } catch {
      return "MISSING";
    }
  }

  async function savedCatalogRows(providerKey = null) {
    try {
      let query = db.from("ai_provider_model_catalog").select("*").order("provider_key").order("model_key");
      if (providerKey) query = query.eq("provider_key", providerKey);
      const result = await query;
      if (result?.error) throw result.error;
      return Array.isArray(result?.data) ? result.data : [];
    } catch (error) {
      asError("MODEL_CATALOG_READ_FAILED", error);
    }
  }

  async function listCatalog(actorUserId) {
    await requireAdmin(actorUserId);
    const runtime = listRuntimeCatalog({ catalog: modelCatalog }).items;
    const saved = await savedCatalogRows();
    const applicationMap = new Map(runtime.map((item) => [item.id, item.applications]));
    const merged = new Map(runtime.map((item) => [item.id, item]));
    for (const row of saved) {
      const item = publicCatalogItem(row, applicationMap.get(`${row.provider_key}:${row.model_key}`) || []);
      if (!item || item.status !== "active") continue;
      const current = merged.get(item.id);
      merged.set(item.id, current ? { ...current, ...item, applications: current.applications } : item);
    }
    const items = (await Promise.all([...merged.values()].map(async (item) => ({
      ...item,
      credentialStatus: await credentialStatus(item.providerKey),
    }))))
      .sort((a, b) => a.providerKey.localeCompare(b.providerKey) || a.modelKey.localeCompare(b.modelKey));
    return { items };
  }

  async function listProviders(actorUserId) {
    const { items } = await listCatalog(actorUserId);
    const rows = await savedCatalogRows();
    return {
      providers: Object.keys(PROVIDER_REGISTRY).map((providerKey) => {
        const providerRows = rows.filter((row) => row.provider_key === providerKey);
        const latestSync = providerRows.map((row) => row.last_synced_at).filter(Boolean).sort().at(-1) || null;
        return publicProviderStatus({
          providerKey,
          credentialStatus: items.find((item) => item.providerKey === providerKey)?.credentialStatus || "MISSING",
          modelCount: items.filter((item) => item.providerKey === providerKey).length,
          lastSyncedAt: latestSync,
          discoveryStatus: latestSync ? "SYNCED" : "NOT_SYNCED",
        });
      }),
    };
  }

  async function saveCredential(actorUserId, providerKey, { apiKey } = {}) {
    await requireAdmin(actorUserId);
    requireProvider(providerKey);
    const value = String(apiKey || "").trim();
    if (!value) throw new AiProviderCatalogError("API_KEY_REQUIRED");
    const encrypted = encryptCredential(value, encryptionKeyFromEnvironment(env));
    try {
      const result = await db.from("ai_provider_credentials").upsert({
        provider_key: providerKey,
        ...encrypted,
        updated_by: actorUserId,
        updated_at: new Date().toISOString(),
      }, { onConflict: "provider_key" });
      if (result?.error) throw result.error;
    } catch (error) {
      asError("CREDENTIAL_WRITE_FAILED", error);
    }
    await audit?.write?.({ actorUserId, action: "admin.ai_provider_credential_updated", targetType: "ai_provider", targetId: providerKey });
    return { providerKey, credentialStatus: "PRESENT" };
  }

  async function syncModels(actorUserId, providerKey) {
    await requireAdmin(actorUserId);
    const provider = requireProvider(providerKey);
    if (provider.modelDiscovery !== "official-api" || !provider.modelsEndpoint) throw new AiProviderCatalogError("MODEL_CATALOG_DISCOVERY_UNAVAILABLE");
    const apiKey = await effectiveCredential(providerKey);
    if (!apiKey) throw new AiProviderCatalogError("CREDENTIAL_MISSING");
    if (typeof fetchImpl !== "function") throw new AiProviderCatalogError("MODEL_CATALOG_SYNC_FAILED");
    let response;
    try {
      response = await fetchImpl(provider.modelsEndpoint, { headers: { Authorization: `Bearer ${apiKey}` } });
    } catch (error) {
      asError("MODEL_CATALOG_SYNC_FAILED", error);
    }
    if (!response?.ok) throw new AiProviderCatalogError("MODEL_CATALOG_SYNC_FAILED");
    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      asError("MODEL_CATALOG_SYNC_FAILED", error);
    }
    const models = normalizeVendorModels(providerKey, payload);
    const syncedAt = new Date().toISOString();
    try {
      const result = await db.from("ai_provider_model_catalog").upsert(models.map((model) => ({
        provider_key: model.providerKey,
        model_key: model.modelKey,
        display_name: model.displayName,
        status: "active",
        source: "vendor",
        last_synced_at: syncedAt,
        updated_at: syncedAt,
      })), { onConflict: "provider_key,model_key" });
      if (result?.error) throw result.error;
    } catch (error) {
      asError("MODEL_CATALOG_WRITE_FAILED", error);
    }
    await audit?.write?.({ actorUserId, action: "admin.ai_provider_models_synced", targetType: "ai_provider", targetId: providerKey, metadata: { modelCount: models.length } });
    return { providerKey, modelCount: models.length, syncedAt };
  }

  async function testProvider(actorUserId, providerKey) {
    await requireAdmin(actorUserId);
    const provider = requireProvider(providerKey);
    if (provider.modelDiscovery !== "official-api" || !provider.modelsEndpoint) throw new AiProviderCatalogError("MODEL_CATALOG_DISCOVERY_UNAVAILABLE");
    const apiKey = await effectiveCredential(providerKey);
    if (!apiKey) throw new AiProviderCatalogError("CREDENTIAL_MISSING");
    if (typeof fetchImpl !== "function") throw new AiProviderCatalogError("PROVIDER_TEST_FAILED");
    try {
      const response = await fetchImpl(provider.modelsEndpoint, { headers: { Authorization: `Bearer ${apiKey}` } });
      if (!response?.ok) throw new Error("provider rejected credential");
      return { providerKey, status: "OK" };
    } catch (error) {
      asError("PROVIDER_TEST_FAILED", error);
    }
  }

  return { listCatalog, listProviders, saveCredential, syncModels, testProvider };
}

module.exports = {
  AiProviderCatalogError,
  PROVIDER_REGISTRY,
  SYSTEM_MODEL_DEFAULTS,
  createAiProviderCatalogService,
  listRuntimeCatalog,
  normalizeVendorModels,
  publicProviderStatus,
};
