/**
 * Nutrition backfill service.
 * Replaces AI-estimated per-100g nutrition values with USDA standard data
 * when a match is found in the food catalog. Falls back to AI estimates.
 */

const PER_ITEM_TIMEOUT_MS = 3_000;
const MAX_ITEMS = 10;

function withTimeout(promise, ms, fallbackValue) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallbackValue), ms)),
  ]);
}

/** Strip parenthetical notes so "白米饭 (含葱油/炸蒜)" → "白米饭". */
function simplifyFoodQuery(name) {
  return String(name ?? "")
    .replace(/[（(][^）)]*[）)]/g, " ")
    .replace(/\[[^\]]*]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Reject USDA hits that clearly contradict the vision estimate —
 * especially starchy foods wrongly matched to zero-carb meats,
 * or low-calorie soups wrongly matched to dense chicken meat.
 */
function isPlausibleNutritionMatch(item, match) {
  const usdaCalories = Number(match?.caloriesKcalPer100g);
  if (!Number.isFinite(usdaCalories) || usdaCalories <= 0) return false;

  const aiCalories = Number(item?.caloriesPer100g);
  if (Number.isFinite(aiCalories) && aiCalories > 0) {
    const ratio = usdaCalories / aiCalories;
    if (ratio < 0.4 || ratio > 2.5) return false;
  }

  const aiCarbs = Number(item?.carbsPer100g);
  const usdaCarbs = match?.carbsGPer100g == null ? null : Number(match.carbsGPer100g);
  // Vision saw meaningful carbs; USDA match has none → wrong food (e.g. rice → chicken).
  if (Number.isFinite(aiCarbs) && aiCarbs >= 8 && (usdaCarbs == null || usdaCarbs < 1)) {
    return false;
  }
  // Vision saw almost no carbs; USDA is a starch → wrong food (e.g. chicken → rice).
  if (Number.isFinite(aiCarbs) && aiCarbs < 2 && Number.isFinite(usdaCarbs) && usdaCarbs >= 15) {
    return false;
  }

  const aiProtein = Number(item?.proteinPer100g);
  const usdaProtein = match?.proteinGPer100g == null ? null : Number(match.proteinGPer100g);
  // Low-protein food (soup/sauce/oil) matched to dense meat.
  if (Number.isFinite(aiProtein) && aiProtein < 5 && Number.isFinite(usdaProtein) && usdaProtein >= 18) {
    return false;
  }
  // High-protein food matched to near-zero protein (oil/sugar).
  if (Number.isFinite(aiProtein) && aiProtein >= 15 && (usdaProtein == null || usdaProtein < 3)) {
    return false;
  }

  const aiFat = Number(item?.fatPer100g);
  const usdaFat = match?.fatGPer100g == null ? null : Number(match.fatGPer100g);
  // Fatty food matched to near-zero fat.
  if (Number.isFinite(aiFat) && aiFat >= 12 && (usdaFat == null || usdaFat < 1)) {
    return false;
  }

  return true;
}

function createNutritionBackfillService({ foodCatalog } = {}) {
  if (!foodCatalog || typeof foodCatalog.lookupNutrition !== "function") return null;
  return async (items) => {
    if (!Array.isArray(items) || !items.length) return items;
    const targets = items.slice(0, MAX_ITEMS);
    const enriched = await Promise.all(
      targets.map(async (item) => {
        try {
          const query = simplifyFoodQuery(item.name) || item.name;
          const match = await withTimeout(
            foodCatalog.lookupNutrition(query),
            PER_ITEM_TIMEOUT_MS,
            null,
          );
          if (match && isPlausibleNutritionMatch(item, match)) {
            return {
              ...item,
              caloriesPer100g: match.caloriesKcalPer100g,
              proteinPer100g: match.proteinGPer100g ?? item.proteinPer100g,
              carbsPer100g: match.carbsGPer100g ?? item.carbsPer100g,
              fatPer100g: match.fatGPer100g ?? item.fatPer100g,
              nutritionSource: "usda",
            };
          }
        } catch (err) {
          console.error("[backfill] lookup failed for", item.name, err?.message || err);
        }
        return { ...item, nutritionSource: "ai_estimate" };
      }),
    );
    // Preserve any items beyond MAX_ITEMS with ai_estimate marker.
    const remaining = items.slice(MAX_ITEMS).map((item) => ({ ...item, nutritionSource: "ai_estimate" }));
    return [...enriched, ...remaining];
  };
}

module.exports = {
  createNutritionBackfillService,
  isPlausibleNutritionMatch,
  simplifyFoodQuery,
};
