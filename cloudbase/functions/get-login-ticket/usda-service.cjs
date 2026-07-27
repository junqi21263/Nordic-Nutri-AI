// usda-service.cjs
// USDA FoodData Central adapter. Search + detail, nutrient normalization to
// per-100g unified fields, Foundation/SR Legacy/FNDDS preference, Branded
// serving-size scaling, kJ->kcal conversion. Raw payloads are returned so the
// repository can persist them in food_source_payloads; the complex USDA shape
// is never forwarded to the client.

const https = require("node:https");

const DEFAULT_BASE_URL = "https://api.nal.usda.gov/fdc/v1";
const DEFAULT_TIMEOUT_MS = 7000;

class UsdaServiceError extends Error {
  constructor(code) { super(code); this.code = code; }
}

function nutrientValue(food, nutrientName, { preferUnit } = {}) {
  const nutrients = Array.isArray(food?.foodNutrients) ? food.foodNutrients : [];
  const matches = nutrients.filter((item) => item?.nutrientName === nutrientName);
  if (!matches.length) return null;
  let nutrient = matches[0];
  if (preferUnit) {
    const preferred = matches.find((item) => String(item?.unitName || "").toUpperCase() === preferUnit.toUpperCase());
    if (preferred) nutrient = preferred;
  }
  const value = Number(nutrient?.value);
  if (!Number.isFinite(value) || value < 0) return null;
  const unit = String(nutrient?.unitName || "").toUpperCase();
  if (nutrientName === "Energy" && (unit === "KJ" || unit === "KJOULE")) {
    return Math.round((value / 4.184) * 100) / 100;
  }
  return value;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function scaleBrandedToPer100g(value, servingSize, servingUnit, dataType) {
  if (value == null) return null;
  if (!dataType || /foundation|sr legacy|survey|fndds/i.test(dataType)) return value;
  const size = Number(servingSize);
  const unit = String(servingUnit || "").toLowerCase();
  if (!Number.isFinite(size) || size <= 0) return value;
  if (!["g", "ml", "gram", "grams"].includes(unit)) return value;
  if (Math.abs(size - 100) < 0.01) return value;
  return Math.round((value / size) * 100 * 100) / 100;
}

function rankDataType(dataType) {
  const type = String(dataType || "").toLowerCase();
  if (type.includes("foundation")) return 0;
  if (type.includes("sr legacy")) return 1;
  if (type.includes("survey") || type.includes("fndds")) return 2;
  if (type.includes("branded")) return 5;
  return 4;
}

function mapUsdaFood(food) {
  const sourceFoodId = (Number.isInteger(food?.fdcId) || typeof food?.fdcId === "string") ? String(food.fdcId) : "";
  const description = typeof food?.description === "string" ? food.description.trim() : "";
  if (!sourceFoodId || !description) return null;
  const dataType = typeof food.dataType === "string" && food.dataType.trim() ? food.dataType.trim() : null;
  const servingSize = numberOrNull(food.servingSize);
  const servingUnit = typeof food.servingSizeUnit === "string" && food.servingSizeUnit.trim() ? food.servingSizeUnit.trim() : null;
  const rawCalories = nutrientValue(food, "Energy", { preferUnit: "KCAL" });
  const rawProtein = nutrientValue(food, "Protein");
  const rawCarbs = nutrientValue(food, "Carbohydrate, by difference");
  const rawFat = nutrientValue(food, "Total lipid (fat)");
  const rawFiber = nutrientValue(food, "Fiber, total dietary");
  const rawSugar = nutrientValue(food, "Sugars, total including NLEA");
  const rawSodium = nutrientValue(food, "Sodium, Na");
  return {
    source: "usda",
    sourceId: sourceFoodId,
    fdcId: Number(food.fdcId) || null,
    description,
    name_en: description,
    brandName: typeof food.brandOwner === "string" && food.brandOwner.trim() ? food.brandOwner.trim() : null,
    dataType,
    category: typeof food.foodCategory === "string" && food.foodCategory.trim() ? food.foodCategory.trim() : null,
    servingSize,
    servingUnit,
    calories: scaleBrandedToPer100g(rawCalories, servingSize, servingUnit, dataType) ?? 0,
    protein_g: scaleBrandedToPer100g(rawProtein, servingSize, servingUnit, dataType) ?? 0,
    carbs_g: scaleBrandedToPer100g(rawCarbs, servingSize, servingUnit, dataType) ?? 0,
    fat_g: scaleBrandedToPer100g(rawFat, servingSize, servingUnit, dataType) ?? 0,
    fiber_g: scaleBrandedToPer100g(rawFiber, servingSize, servingUnit, dataType),
    sugar_g: scaleBrandedToPer100g(rawSugar, servingSize, servingUnit, dataType),
    sodium_mg: scaleBrandedToPer100g(rawSodium, servingSize, servingUnit, dataType),
    nutritionBasis: "per_100g",
    sourceUrl: `https://fdc.nal.usda.gov/food-details/${sourceFoodId}/nutrients`,
    rawPayload: food,
  };
}

function requestJson(url, { timeoutMs, headers } = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: timeoutMs ?? DEFAULT_TIMEOUT_MS, headers }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => {
        if (response.statusCode !== 200) {
          reject(new UsdaServiceError(`USDA_HTTP_${response.statusCode ?? 0}`));
          return;
        }
        try { resolve(JSON.parse(raw)); } catch { reject(new UsdaServiceError("USDA_RESPONSE_INVALID")); }
      });
    });
    request.on("timeout", () => request.destroy(new UsdaServiceError("USDA_TIMEOUT")));
    request.on("error", (err) => reject(err instanceof UsdaServiceError ? err : new UsdaServiceError("USDA_REQUEST_FAILED")));
  });
}

function createUsdaService({ apiKey, baseUrl = DEFAULT_BASE_URL, timeoutMs = DEFAULT_TIMEOUT_MS, fetcher = requestJson } = {}) {
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("USDA API key unavailable");
  return {
    async search({ query, page = 1, pageSize = 20, dataTypes } = {}) {
      const q = String(query ?? "").trim();
      if (q.length < 2 || q.length > 80) throw new UsdaServiceError("USDA_QUERY_INVALID");
      const params = new URLSearchParams({ api_key: apiKey, query: q, pageNumber: String(page), pageSize: String(Math.min(pageSize, 200)) });
      if (Array.isArray(dataTypes) && dataTypes.length) params.set("dataType", dataTypes.join(","));
      const data = await fetcher(`${baseUrl}/foods/search?${params}`, { timeoutMs });
      return {
        foods: Array.isArray(data?.foods) ? data.foods.map(mapUsdaFood).filter(Boolean) : [],
        totalHits: Number(data?.totalHits) || 0,
        raw: data,
      };
    },

    async getDetail(fdcId) {
      const id = Number(fdcId);
      if (!Number.isInteger(id) || id <= 0) throw new UsdaServiceError("USDA_FDC_ID_INVALID");
      const data = await fetcher(`${baseUrl}/food/${id}?api_key=${apiKey}`, { timeoutMs });
      const mapped = mapUsdaFood(data);
      return mapped ? { ...mapped, rawPayload: data } : null;
    },

    mapUsdaFood,
    rankDataType,
    pickBestNutritionMatch(foods) {
      const usable = (Array.isArray(foods) ? foods : []).filter((f) => f && (
        Number.isFinite(f.calories) && f.calories > 0
        || Number.isFinite(f.protein_g) && f.protein_g > 0
      ));
      if (!usable.length) return null;
      return [...usable].sort((a, b) => rankDataType(a.dataType) - rankDataType(b.dataType))[0];
    },
  };
}

module.exports = {
  DEFAULT_BASE_URL,
  UsdaServiceError,
  createUsdaService,
  mapUsdaFood,
  nutrientValue,
  rankDataType,
  scaleBrandedToPer100g,
};
