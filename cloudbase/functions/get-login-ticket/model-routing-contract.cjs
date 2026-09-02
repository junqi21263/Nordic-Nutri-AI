const MODEL_CAPABILITIES = Object.freeze([
  "text",
  "vision",
  "image_generation",
]);

const FEATURE_CAPABILITIES = Object.freeze({
  coach: "text",
  daily_insight: "text",
  weekly_review: "text",
  nutrition_plan: "text",
  daily_tip: "text",
  proactive_daily_brief: "text",
  meal_analysis: "text",
  meal_evaluation: "text",
  meal_insight: "text",
  food_query_translation: "text",
  food_recognition: "vision",
  food_image_generation: "image_generation",
});

const FEATURE_ROUTE_KEYS = Object.freeze({
  food_recognition: ["food_recognition", "vision"],
  food_image_generation: ["food_image_generation", "food_image"],
});

function normalizeCapabilities(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .map((item) => String(item || "").trim())
    .filter((item) => MODEL_CAPABILITIES.includes(item))));
}

function modelCapabilities({ modelKey, capabilities } = {}) {
  void modelKey;
  const explicit = normalizeCapabilities(capabilities);
  return explicit;
}

function featureCapability(feature) {
  const key = String(feature || "").trim();
  return FEATURE_CAPABILITIES[key] || null;
}

function featureRouteKeys(feature) {
  const key = String(feature || "").trim();
  return FEATURE_ROUTE_KEYS[key] || (FEATURE_CAPABILITIES[key] ? [key] : []);
}

module.exports = {
  MODEL_CAPABILITIES,
  FEATURE_CAPABILITIES,
  FEATURE_ROUTE_KEYS,
  normalizeCapabilities,
  modelCapabilities,
  featureCapability,
  featureRouteKeys,
};
