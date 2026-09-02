const {
  featureCapability,
  featureRouteKeys,
  modelCapabilities,
} = require("./model-routing-contract.cjs");

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
  return modelCapabilities({ modelKey, capabilities: row?.metadata?.capabilities }).includes(capability);
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

function createModelRouteResolver({ db = null, listConfigs = null, getCredential = async () => null } = {}) {
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
    const rows = await readConfigs();
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
  createModelRouteResolver,
};
