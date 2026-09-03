function createVisionAdapterRegistry(adapters = {}) {
  const entries = new Map(Object.entries(adapters).filter(([, adapter]) => typeof adapter === "function"));
  return {
    get(providerKey) { return entries.get(String(providerKey || "").trim()) || null; },
    has(providerKey) { return entries.has(String(providerKey || "").trim()); },
    keys() { return Array.from(entries.keys()).sort(); },
  };
}

module.exports = { createVisionAdapterRegistry };
