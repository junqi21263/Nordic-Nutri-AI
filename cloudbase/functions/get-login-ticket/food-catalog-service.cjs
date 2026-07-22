const https = require("node:https");

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 20;
const MAX_PAGE = 50;

class PublicFoodCatalogError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

function normalizeQuery(query) {
  const normalized = typeof query === "string" ? query.trim().replace(/\s+/g, " ") : "";
  if (normalized.length < 2 || normalized.length > 80) throw new PublicFoodCatalogError("FOOD_QUERY_INVALID");
  return normalized;
}

function normalizePage(page) {
  const number = Number(page);
  if (!Number.isInteger(number) || number < 1 || number > MAX_PAGE) throw new PublicFoodCatalogError("FOOD_PAGE_INVALID");
  return number;
}

function nutrientValue(food, nutrientName) {
  const nutrients = Array.isArray(food?.foodNutrients) ? food.foodNutrients : [];
  const nutrient = nutrients.find((item) => item?.nutrientName === nutrientName);
  const value = Number(nutrient?.value);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function numberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function mapUsdaFood(food) {
  const sourceFoodId = Number.isInteger(food?.fdcId) || typeof food?.fdcId === "string" ? String(food.fdcId) : "";
  const description = typeof food?.description === "string" ? food.description.trim() : "";
  if (!sourceFoodId || !description) return null;
  return {
    source: "usda_fdc",
    sourceFoodId,
    description,
    brandName: typeof food.brandOwner === "string" && food.brandOwner.trim() ? food.brandOwner.trim() : null,
    dataType: typeof food.dataType === "string" && food.dataType.trim() ? food.dataType.trim() : null,
    category: typeof food.foodCategory === "string" && food.foodCategory.trim() ? food.foodCategory.trim() : null,
    servingSize: numberOrNull(food.servingSize),
    servingUnit: typeof food.servingSizeUnit === "string" && food.servingSizeUnit.trim() ? food.servingSizeUnit.trim() : null,
    caloriesKcalPer100g: nutrientValue(food, "Energy"),
    proteinGPer100g: nutrientValue(food, "Protein"),
    carbsGPer100g: nutrientValue(food, "Carbohydrate, by difference"),
    fatGPer100g: nutrientValue(food, "Total lipid (fat)"),
    imageUrl: null,
    sourceUrl: `https://fdc.nal.usda.gov/food-details/${sourceFoodId}/nutrients`,
  };
}

function toDatabaseRow(food) {
  return {
    source: food.source,
    source_food_id: food.sourceFoodId,
    description: food.description,
    brand_name: food.brandName,
    data_type: food.dataType,
    category: food.category,
    serving_size: food.servingSize,
    serving_unit: food.servingUnit,
    calories_kcal_per_100g: food.caloriesKcalPer100g,
    protein_g_per_100g: food.proteinGPer100g,
    carbs_g_per_100g: food.carbsGPer100g,
    fat_g_per_100g: food.fatGPer100g,
    image_url: food.imageUrl,
    source_url: food.sourceUrl,
    synced_at: new Date().toISOString(),
  };
}

function mapCatalogRow(row) {
  if (!row?.id || !row?.description) return null;
  return {
    id: row.id,
    source: row.source,
    sourceFoodId: row.source_food_id ?? row.sourceFoodId,
    description: row.description,
    brandName: row.brand_name ?? row.brandName ?? null,
    dataType: row.data_type ?? row.dataType ?? null,
    category: row.category ?? null,
    servingSize: numberOrNull(row.serving_size ?? row.servingSize),
    servingUnit: row.serving_unit ?? row.servingUnit ?? null,
    caloriesKcalPer100g: numberOrNull(row.calories_kcal_per_100g ?? row.caloriesKcalPer100g),
    proteinGPer100g: numberOrNull(row.protein_g_per_100g ?? row.proteinGPer100g),
    carbsGPer100g: numberOrNull(row.carbs_g_per_100g ?? row.carbsGPer100g),
    fatGPer100g: numberOrNull(row.fat_g_per_100g ?? row.fatGPer100g),
    imageUrl: row.image_url ?? row.imageUrl ?? null,
    sourceUrl: row.source_url ?? row.sourceUrl ?? null,
  };
}

function createDatabaseCache(db) {
  return {
    async search(query) {
      const result = await db.from("food_catalog")
        .select("*")
        .ilike("description", `%${query}%`)
        .order("synced_at", { ascending: false })
        .limit(PAGE_SIZE);
      if (result.error) throw new Error("Food cache search failed");
      return result.data ?? [];
    },
    async getById(id) {
      const result = await db.from("food_catalog").select("*").eq("id", id).maybeSingle();
      if (result.error) throw new Error("Food cache lookup failed");
      return result.data ?? null;
    },
    async upsert(rows) {
      if (!rows.length) return [];
      const result = await db.from("food_catalog")
        .upsert(rows, { onConflict: "source,source_food_id" })
        .select("*");
      if (result.error) throw new Error("Food cache write failed");
      return result.data ?? rows;
    },
  };
}

function requestUsdaSearch({ apiKey, query, page }) {
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("USDA API key unavailable");
  const params = new URLSearchParams({
    api_key: apiKey,
    query,
    pageNumber: String(page),
    pageSize: String(PAGE_SIZE),
  });
  const requestUrl = `https://api.nal.usda.gov/fdc/v1/foods/search?${params}`;
  return new Promise((resolve, reject) => {
    const request = https.get(requestUrl, { timeout: 7000 }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => {
        if (response.statusCode !== 200) {
          reject(new Error(`USDA search failed (${response.statusCode ?? 0})`));
          return;
        }
        try {
          const data = JSON.parse(raw);
          resolve(Array.isArray(data?.foods) ? data.foods : []);
        } catch {
          reject(new Error("USDA search response was invalid"));
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("USDA search timed out")));
    request.on("error", reject);
  });
}

function isFresh(row, now) {
  const syncedAt = new Date(row?.synced_at ?? row?.syncedAt ?? 0).getTime();
  return Number.isFinite(syncedAt) && now - syncedAt < CACHE_TTL_MS;
}

function createFoodCatalogService({ db, cache = db ? createDatabaseCache(db) : null, apiKey, searchUsda, now = Date.now }) {
  if (!cache || typeof cache.search !== "function" || typeof cache.upsert !== "function") {
    throw new Error("Food catalog cache is unavailable");
  }
  const search = searchUsda ?? ((query, page) => requestUsdaSearch({ apiKey, query, page }));
  return {
    async search(_userId, query, page) {
      const normalizedQuery = normalizeQuery(query);
      const normalizedPage = normalizePage(page);
      const cached = await cache.search(normalizedQuery);
      const currentTime = now();
      if (cached.length && cached.every((row) => isFresh(row, currentTime))) {
        return { items: cached.map(mapCatalogRow).filter(Boolean), source: "cache", page: normalizedPage };
      }

      let foods;
      try {
        foods = await search(normalizedQuery, normalizedPage);
      } catch (error) {
        if (cached.length) return { items: cached.map(mapCatalogRow).filter(Boolean), source: "cache-stale", page: normalizedPage };
        throw error;
      }
      const rows = foods.map(mapUsdaFood).filter(Boolean).slice(0, PAGE_SIZE).map(toDatabaseRow);
      const persisted = await cache.upsert(rows);
      return {
        items: persisted.map(mapCatalogRow).filter(Boolean),
        source: "usda_fdc",
        page: normalizedPage,
      };
    },
    async getById(_userId, id) {
      const normalizedId = typeof id === "string" ? id.trim() : "";
      if (!/^[0-9a-f-]{36}$/i.test(normalizedId) || typeof cache.getById !== "function") {
        throw new PublicFoodCatalogError("FOOD_ID_INVALID");
      }
      const row = await cache.getById(normalizedId);
      return row ? mapCatalogRow(row) : null;
    },
  };
}

module.exports = {
  CACHE_TTL_MS,
  PAGE_SIZE,
  PublicFoodCatalogError,
  createFoodCatalogService,
  mapCatalogRow,
  mapUsdaFood,
  requestUsdaSearch,
};
