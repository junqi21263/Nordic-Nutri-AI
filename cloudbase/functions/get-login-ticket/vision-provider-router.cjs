function featureKeys(row) {
  const raw = row?.feature_keys ?? row?.featureKeys ?? [];
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === "string") return raw.replace(/[{}]/g, "").split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

function hasVisionBinding(row) {
  const roles = row?.metadata?.routeRoles || row?.metadata?.route_roles || {};
  return featureKeys(row).includes("vision") || roles.vision === "primary" || roles.vision === "fallback";
}

function createConfiguredVisionAnalyzer({ db, adapters = {}, fallbackProvider = "qwen" } = {}) {
  return async (input) => {
    let selectedProvider = fallbackProvider;
    try {
      const result = await db.from("ai_model_configs").select("provider_key, model_key, feature_keys, metadata, enabled");
      const configured = (result?.data || []).find((row) => row.enabled !== false && hasVisionBinding(row));
      if (configured?.provider_key) selectedProvider = String(configured.provider_key).trim();
    } catch (error) {
      console.warn("[vision-router] model binding lookup failed, using fallback:", error?.message || error);
    }
    const adapter = adapters[selectedProvider];
    if (typeof adapter !== "function") {
      const error = new Error(`Vision provider ${selectedProvider} is not configured`);
      error.code = "VISION_PROVIDER_NOT_CONFIGURED";
      throw error;
    }
    return adapter(input);
  };
}

module.exports = { createConfiguredVisionAnalyzer, hasVisionBinding };
