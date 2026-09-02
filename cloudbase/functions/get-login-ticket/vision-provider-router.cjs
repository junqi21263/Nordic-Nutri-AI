const { createVisionAdapterRegistry } = require("./vision-adapter-registry.cjs");
const { classifyVisionProviderError, isRetryableVisionProviderError } = require("./vision-adapter-contract.cjs");

function featureKeys(row) {
  const raw = row?.feature_keys ?? row?.featureKeys ?? [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") return raw.replace(/[{}]/g, "").split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

function visionMetadata(row) {
  return row?.metadata?.vision && typeof row.metadata.vision === "object" ? row.metadata.vision : {};
}

function routeRole(row) {
  const roles = row?.metadata?.routeRoles || row?.metadata?.route_roles || {};
  return roles.vision === "primary" || roles.vision === "fallback" ? roles.vision : null;
}

function hasVisionBinding(row) {
  return featureKeys(row).includes("vision") || Boolean(routeRole(row));
}

function candidateSort(left, right) {
  const roleRank = (row) => routeRole(row) === "primary" ? 2 : routeRole(row) === "fallback" ? 1 : 0;
  const roleDifference = roleRank(right) - roleRank(left);
  if (roleDifference) return roleDifference;
  const priorityDifference = Number(visionMetadata(right).priority || 0) - Number(visionMetadata(left).priority || 0);
  if (priorityDifference) return priorityDifference;
  const updatedDifference = String(right.updated_at || right.updatedAt || "").localeCompare(String(left.updated_at || left.updatedAt || ""));
  if (updatedDifference) return updatedDifference;
  return `${left.provider_key}:${left.model_key}`.localeCompare(`${right.provider_key}:${right.model_key}`);
}

function normalizeRows(rows, registry) {
  return (rows || [])
    .filter((row) => row?.enabled !== false && hasVisionBinding(row))
    .map((row) => ({
      provider: String(row.provider_key ?? row.providerKey ?? "").trim(),
      model: String(row.model_key ?? row.modelKey ?? "").trim() || null,
      adapter: registry.get(row.provider_key ?? row.providerKey),
      row,
    }))
    .filter((candidate) => candidate.provider && candidate.adapter)
    .sort((left, right) => candidateSort(left.row, right.row));
}

function createRoutedVisionAnalyzer({ resolver, createService, beforeInvoke = null } = {}) {
  if (!resolver || typeof resolver.resolveCandidates !== "function") throw new Error("Model route resolver is required");
  if (typeof createService !== "function") throw new Error("Routed vision service factory is required");
  return async (input) => {
    const candidates = await resolver.resolveCandidates({ feature: "food_recognition" });
    const attempts = [];
    let lastError = null;
    for (let index = 0; index < candidates.length; index += 1) {
      const route = candidates[index];
      const startedAt = Date.now();
      try {
        if (typeof beforeInvoke === "function") await beforeInvoke({ route, feature: "food_recognition", attempt: index });
        const result = await createService({ route })(input);
        return {
          ...result,
          provider: result?.provider || route.providerKey,
          model: result?.model || route.modelKey,
          attempts: [...attempts, { provider: route.providerKey, model: route.modelKey, durationMs: Date.now() - startedAt, status: "succeeded" }],
          fallbackUsed: index > 0,
        };
      } catch (error) {
        const errorClass = classifyVisionProviderError(error);
        attempts.push({ provider: route.providerKey, model: route.modelKey, durationMs: Date.now() - startedAt, status: "failed", errorClass, errorCode: error?.code || null, providerHttpStatus: error?.providerHttpStatus ?? error?.status ?? null });
        lastError = error;
        if (!isRetryableVisionProviderError(error)) break;
      }
    }
    if (lastError) {
      lastError.attempts = attempts;
      lastError.provider = attempts.at(-1)?.provider || null;
      lastError.model = attempts.at(-1)?.model || null;
      throw lastError;
    }
    const error = new Error("No vision provider is configured");
    error.code = "VISION_PROVIDER_NOT_CONFIGURED";
    error.attempts = attempts;
    throw error;
  };
}

function createConfiguredVisionAnalyzer({ db, adapters = {}, registry = createVisionAdapterRegistry(adapters), fallbackProvider = "qwen", beforeInvoke = null } = {}) {
  return async (input) => {
    let rows = [];
    try {
      const result = await db.from("ai_model_configs").select("provider_key, model_key, feature_keys, metadata, enabled, updated_at");
      rows = result?.data || [];
    } catch (error) {
      console.warn("[vision-router] model binding lookup failed, using registered adapters:", error?.message || error);
    }
    const candidates = normalizeRows(rows, registry);
    const configuredProviders = new Set(candidates.map((candidate) => candidate.provider));
    for (const provider of registry.keys()) {
      if (!configuredProviders.has(provider)) {
        candidates.push({ provider, model: null, adapter: registry.get(provider), row: {} });
      }
    }
    if (!candidates.length) {
      const error = new Error("No vision provider is configured");
      error.code = "VISION_PROVIDER_NOT_CONFIGURED";
      throw error;
    }
    const attempts = [];
    let lastError = null;
    for (const candidate of candidates) {
      const startedAt = Date.now();
      try {
        if (candidate.model && typeof beforeInvoke === "function") {
          await beforeInvoke({ candidate, feature: "vision", attempt: attempts.length });
        }
        const result = await candidate.adapter({ ...input, model: candidate.model, provider: candidate.provider });
        return {
          ...result,
          provider: result?.provider || candidate.provider,
          model: result?.model || candidate.model,
          attempts: [...attempts, { provider: candidate.provider, model: result?.model || candidate.model, durationMs: Date.now() - startedAt, status: "succeeded" }],
          fallbackUsed: attempts.length > 0,
        };
      } catch (error) {
        const errorClass = classifyVisionProviderError(error);
        attempts.push({ provider: candidate.provider, model: candidate.model, durationMs: Date.now() - startedAt, status: "failed", errorClass, errorCode: error?.code || null, providerHttpStatus: error?.providerHttpStatus ?? error?.status ?? null });
        lastError = error;
        if (!isRetryableVisionProviderError(error)) break;
      }
    }
    if (lastError) {
      lastError.attempts = attempts;
      lastError.provider = attempts.at(-1)?.provider || fallbackProvider;
      lastError.model = attempts.at(-1)?.model || null;
      throw lastError;
    }
    const error = new Error("No vision provider is configured");
    error.code = "VISION_PROVIDER_NOT_CONFIGURED";
    error.attempts = attempts;
    throw error;
  };
}

module.exports = { createConfiguredVisionAnalyzer, createRoutedVisionAnalyzer, hasVisionBinding, candidateSort, normalizeRows };
