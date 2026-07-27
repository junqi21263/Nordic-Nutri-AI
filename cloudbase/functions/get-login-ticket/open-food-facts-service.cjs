// open-food-facts-service.cjs
// Open Food Facts adapter. Barcode lookup for packaged products, image
// priority resolution, nutrition extraction. Packaged-product supplement
// source only; USDA remains the primary nutrition source. Results are cached
// by the repository; this module is stateless and injectable.

const https = require("node:https");

const DEFAULT_BASE_URL = "https://world.openfoodfacts.org";
const DEFAULT_USER_AGENT = "NordicNutriAI/1.0 (food-catalog; support@nordicnutri.app)";
const DEFAULT_TIMEOUT_MS = 4000;

class OpenFoodFactsError extends Error {
  constructor(code) { super(code); this.code = code; }
}

function requestJson(url, { timeoutMs, headers } = {}) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, { timeout: timeoutMs ?? DEFAULT_TIMEOUT_MS, headers }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => {
        if (response.statusCode !== 200) {
          reject(new OpenFoodFactsError(`OFF_HTTP_${response.statusCode ?? 0}`));
          return;
        }
        try { resolve(JSON.parse(raw)); } catch { reject(new OpenFoodFactsError("OFF_RESPONSE_INVALID")); }
      });
    });
    request.on("timeout", () => request.destroy(new OpenFoodFactsError("OFF_TIMEOUT")));
    request.on("error", (err) => reject(err instanceof OpenFoodFactsError ? err : new OpenFoodFactsError("OFF_REQUEST_FAILED")));
  });
}

function pickFrontImage(product) {
  if (!product || typeof product !== "object") return null;
  // Priority: selected_images front display zh/en, then small/front urls.
  const selected = product.selected_images?.front?.display;
  if (selected?.zh) return selected.zh;
  if (selected?.en) return selected.en;
  if (product.image_front_small_url) return product.image_front_small_url;
  if (product.image_front_url) return product.image_front_url;
  if (product.image_small_url) return product.image_small_url;
  if (product.image_url) return product.image_url;
  return null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// OFF nutrition is per-serving; convert to per-100g using serving_size grams.
function parseServingGrams(product) {
  const raw = String(product?.serving_size ?? product?.serving_quantity ?? "");
  const match = raw.match(/(\d+(?:\.\d+)?)\s*(?:g|gram|gr|ml)\b/i);
  if (match) return Number(match[1]);
  const q = Number(product?.serving_quantity);
  return Number.isFinite(q) && q > 0 ? q : null;
}

function scaleToPer100g(value, servingGrams) {
  if (value == null) return null;
  const g = Number(servingGrams);
  if (!Number.isFinite(g) || g <= 0) return value; // Assume already per-100g if no serving.
  if (Math.abs(g - 100) < 0.01) return value;
  return Math.round((value / g) * 100 * 100) / 100;
}

function mapOpenFoodFactsProduct(product, barcode) {
  if (!product || (typeof product.status === "number" && product.status === 0)) return null;
  const name = (product.product_name || product.product_name_en || product.generic_name || "").toString().trim();
  if (!name && !barcode) return null;
  const servingGrams = parseServingGrams(product);
  const n = product.nutriments || {};
  const calories = numberOrNull(n["energy-kcal"] ?? n["energy-kcal_100g"] ?? n.energy);
  const protein = numberOrNull(n.proteins ?? n["proteins_100g"]);
  const carbs = numberOrNull(n.carbohydrates ?? n["carbohydrates_100g"]);
  const fat = numberOrNull(n.fat ?? n["fat_100g"]);
  const fiber = numberOrNull(n.fiber ?? n["fiber_100g"]);
  const sugar = numberOrNull(n.sugars ?? n["sugars_100g"]);
  const sodium = numberOrNull(n.sodium ?? n["sodium_100g"]);
  const missing = [calories, protein, carbs, fat].filter((v) => v == null).length;
  return {
    source: "open_food_facts",
    sourceId: String(barcode ?? product.code ?? ""),
    barcode: String(barcode ?? product.code ?? ""),
    name_en: name || null,
    name_zh: (product.product_name_zh || null),
    brandName: (product.brands || null),
    description: name || null,
    category: product.categories || null,
    servingSize: servingGrams,
    servingUnit: "g",
    calories: scaleToPer100g(calories, servingGrams) ?? 0,
    protein_g: scaleToPer100g(protein, servingGrams) ?? 0,
    carbs_g: scaleToPer100g(carbs, servingGrams) ?? 0,
    fat_g: scaleToPer100g(fat, servingGrams) ?? 0,
    fiber_g: scaleToPer100g(fiber, servingGrams),
    sugar_g: scaleToPer100g(sugar, servingGrams),
    sodium_mg: scaleToPer100g(sodium, servingGrams),
    nutritionBasis: "per_100g",
    imageUrl: pickFrontImage(product),
    sourceUrl: product.code ? `https://world.openfoodfacts.org/product/${product.code}` : null,
    license: "Open Food Facts (ODbL)",
    attribution: "Data provided by Open Food Facts (https://world.openfoodfacts.org)",
    qualityScore: missing >= 2 ? 30 : 70,
    rawPayload: product,
  };
}

function createOpenFoodFactsService({
  baseUrl = DEFAULT_BASE_URL,
  userAgent = DEFAULT_USER_AGENT,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  fetcher = requestJson,
} = {}) {
  return {
    async getByBarcode(barcode) {
      const code = String(barcode ?? "").trim();
      if (!/^\d{6,14}$/.test(code)) throw new OpenFoodFactsError("OFF_BARCODE_INVALID");
      const url = `${baseUrl}/api/v2/product/${code}.json?fields=product_name,product_name_en,product_name_zh,generic_name,brands,categories,serving_size,serving_quantity,nutriments,image_url,image_small_url,image_front_url,image_front_small_url,selected_images,code`;
      const data = await fetcher(url, { timeoutMs, headers: { "User-Agent": userAgent } });
      return mapOpenFoodFactsProduct(data?.product, code);
    },
    mapOpenFoodFactsProduct,
    pickFrontImage,
  };
}

module.exports = {
  DEFAULT_BASE_URL,
  DEFAULT_USER_AGENT,
  OpenFoodFactsError,
  createOpenFoodFactsService,
  mapOpenFoodFactsProduct,
  parseServingGrams,
  pickFrontImage,
  scaleToPer100g,
};
