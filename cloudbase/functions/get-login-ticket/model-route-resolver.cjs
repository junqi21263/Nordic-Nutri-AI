const {
  featureCapability,
  featureRouteKeys,
  modelCapabilities,
} = require("./model-routing-contract.cjs");

function runtimeCatalogRows(catalog = []) {
  const models = new Map();
  for (const item of catalog || []) {
    const providerKey = String(item?.providerKey ?? item?.provider ?? "").trim();
    const modelKey = String(item?.modelKey ?? item?.model ?? "").trim();
    if (!providerKey || !modelKey) continue;
    const id = `${providerKey}:${modelKey}`;
    const current = models.get(id) || {
      provider_key: providerKey,
      model_key: modelKey,
      display_name: item.displayName || modelKey,
      base_url: item.baseUrl || null,
      endpoint: item.endpoint || null,
      protocol: item.protocol || null,
      timeout_ms: item.timeoutMs ?? 30000,
      max_tokens: item.maxTokens ?? 2048,
      temperature: item.temperature ?? 0.2,
      feature_keys: [],
      enabled: item.enabled !== false,
      metadata: { ...(item.metadata || {}), capabilities: [] },
      updated_at: null,
    };
    const feature = String(item.feature || "").trim();
    const applications = Array.isArray(item.applications) ? item.applications : [];
    for (const key of [...applications, ...(feature ? [feature] : [])]) {
      const normalized = String(key).trim();
      if (normalized && !current.feature_keys.includes(normalized)) current.feature_keys.push(normalized);
      const capability = featureCapability(normalized);
      if (capability && !current.metadata.capabilities.includes(capability)) current.metadata.capabilities.push(capability);
    }
    if (Array.isArray(item.metadata?.capabilities)) {
      for (const capability of item.metadata.capabilities) {
        if (!current.metadata.capabilities.includes(capability)) current.metadata.capabilities.push(capability);
      }
    }
    models.set(id, current);
  }
  return [...models.values()];
}

class ModelRouteError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "ModelRouteError";
    this.code = code;
  }
}

function featureKeys(row = {}) {
  const raw = row.feature_keys ?? row.featureKeys ?? [];
  if (Array.isArray(raw)) return raw.map((item) => String(item).trim()).filter(Boolean);
  if (typeof raw === "string") return raw.replace(/[{}]/g, "").split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

function routeRole(row = {}, keys = []) {
  const roles = row?.metadata?.routeRoles ?? row?.metadata?.route_roles ?? {};
  if (!roles || typeof roles !== "object" || Array.isArray(roles)) return null;
  for (const key of keys) {
    const role = String(roles[key] || "").trim();
    if (role === "primary" || role === "fallback") return role;
  }
  return null;
}

function candidateRank(row, keys) {
  const role = routeRole(row, keys);
  if (role === "primary") return 2;
  if (role === "fallback") return 0;
  return 1;
}

function isCompatible(row, { capability, keys }) {
  if (!row || row.enabled === false) return false;
  const providerKey = String(row.provider_key ?? row.providerKey ?? "").trim();
  const modelKey = String(row.model_key ?? row.modelKey ?? "").trim();
  if (!providerKey || !modelKey) return false;
  const applications = featureKeys(row);
  if (!applications.some((item) => keys.includes(item)) && !routeRole(row, keys)) return false;
  // Older persisted routes predate capability metadata. A binding to a
  // feature-route key is itself an explicit capability declaration, so infer
  // only the capability required by that route. This keeps legacy data
  // compatible without introducing provider/model-specific assumptions.
  const declaredCapabilities = modelCapabilities({ modelKey, capabilities: row?.metadata?.capabilities });
  const inferredCapabilities = declaredCapabilities.length
    ? []
    : applications.some((item) => keys.includes(item)) ? [capability] : [];
  return modelCapabilities({
    modelKey,
    capabilities: [...declaredCapabilities, ...inferredCapabilities],
  }).includes(capability);
}

function compareCandidates(left, right, keys) {
  const rankDifference = candidateRank(right, keys) - candidateRank(left, keys);
  if (rankDifference) return rankDifference;
  const updatedDifference = String(right.updated_at ?? right.updatedAt ?? "").localeCompare(String(left.updated_at ?? left.updatedAt ?? ""));
  if (updatedDifference) return updatedDifference;
  const leftId = `${left.provider_key ?? left.providerKey}:${left.model_key ?? left.modelKey}`;
  const rightId = `${right.provider_key ?? right.providerKey}:${right.model_key ?? right.modelKey}`;
  return leftId.localeCompare(rightId);
}

function positiveInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toBinding(row, { feature, capability, keys, credential }) {
  return {
    feature,
    capability,
    providerKey: String(row.provider_key ?? row.providerKey).trim(),
    modelKey: String(row.model_key ?? row.modelKey).trim(),
    displayName: String(row.display_name ?? row.displayName ?? row.model_key ?? row.modelKey).trim(),
    baseUrl: String(row.base_url ?? row.baseUrl ?? "").trim() || null,
    endpoint: String(row.endpoint ?? "").trim() || null,
    protocol: String(row.protocol ?? "").trim() || null,
    timeoutMs: positiveInteger(row.timeout_ms ?? row.timeoutMs),
    maxTokens: positiveInteger(row.max_tokens ?? row.maxTokens),
    temperature: finiteNumber(row.temperature),
    role: routeRole(row, keys) || "default",
    credential: credential || null,
  };
}

function createModelRouteResolver({ db = null, listConfigs = null, runtimeCatalog = [], getCredential = async () => null } = {}) {
  const readConfigs = typeof listConfigs === "function"
    ? listConfigs
    : async () => {
      const query = typeof db?.from === "function" ? db.from("ai_model_configs") : null;
      if (!query || typeof query.select !== "function") throw new ModelRouteError("MODEL_ROUTE_STORE_UNAVAILABLE");
      try {
        const result = await query.select("provider_key,model_key,display_name,base_url,endpoint,protocol,timeout_ms,max_tokens,temperature,feature_keys,enabled,metadata,updated_at");
        if (result?.error) throw new ModelRouteError("MODEL_ROUTE_READ_FAILED");
        return Array.isArray(result?.data) ? result.data : [];
      } catch (error) {
        if (error instanceof ModelRouteError) throw error;
        throw new ModelRouteError("MODEL_ROUTE_READ_FAILED");
      }
    };

  async function resolveCandidates({ feature } = {}) {
    const capability = featureCapability(feature);
    const keys = featureRouteKeys(feature);
    if (!capability || !keys.length) throw new ModelRouteError("MODEL_FEATURE_UNSUPPORTED");
    const persistedRows = await readConfigs();
    const persistedKeys = new Set((persistedRows || []).map((row) => `${row.provider_key ?? row.providerKey}:${row.model_key ?? row.modelKey}`));
    const hasPersistedConfigs = (persistedRows || []).length > 0;
    const rows = [
      ...(persistedRows || []),
      // Runtime catalog entries are compatibility defaults only for a truly
      // empty route store. Once the configuration center has any persisted
      // model, every feature must be explicitly configured there; otherwise
      // an old default can silently win or be logged as the active route.
      ...(!hasPersistedConfigs
        ? runtimeCatalogRows(runtimeCatalog).filter((row) => !persistedKeys.has(`${row.provider_key}:${row.model_key}`))
        : []),
    ];
    const candidates = rows
      .filter((row) => isCompatible(row, { capability, keys }))
      .sort((left, right) => compareCandidates(left, right, keys));
    return Promise.all(candidates.map(async (row) => toBinding(row, {
      feature,
      capability,
      keys,
      credential: await getCredential(String(row.provider_key ?? row.providerKey).trim()),
    })));
  }

  async function resolve({ feature } = {}) {
    const candidates = await resolveCandidates({ feature });
    if (!candidates.length) throw new ModelRouteError("MODEL_ROUTE_NOT_CONFIGURED");
    return candidates[0];
  }

  return { resolve, resolveCandidates };
}

module.exports = {
  ModelRouteError,
  featureKeys,
  routeRole,
  isCompatible,
  runtimeCatalogRows,
  createModelRouteResolver,
};
