const https = require("node:https");

const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 20;
const MAX_PAGE = 50;
const HAN_PATTERN = /[\u3400-\u9fff]/;

// A small, server-owned fallback keeps the core nutrition-recording journey
// available while the public USDA endpoint is rate-limited or unreachable.
// It is not a replacement for USDA; successful USDA results are still cached
// and preferred for search and discovery.
const CURATED_FALLBACK_FOODS = [
  ["salmon", "Salmon, Atlantic, cooked", 206, 22.1, 0, 12.4],
  ["chicken-breast", "Chicken breast, cooked", 165, 31, 0, 3.6],
  ["beef", "Beef, lean, cooked", 217, 26.1, 0, 11.8],
  ["shrimp", "Shrimp, cooked", 99, 24, 0.2, 0.3],
  ["egg", "Egg, whole, cooked", 155, 12.6, 1.1, 10.6],
  ["tofu", "Tofu, firm", 144, 17.3, 2.8, 8.7],
  ["greek-yogurt", "Greek yogurt, plain", 97, 9, 3.9, 5],
  ["milk", "Milk, low fat", 50, 3.4, 5, 1.9],
  ["oatmeal", "Oatmeal, cooked", 71, 2.5, 12, 1.5],
  ["rice", "Rice, white, cooked", 130, 2.4, 28.2, 0.3],
  ["potato", "Potato, baked", 93, 2.5, 21.2, 0.1],
  ["banana", "Banana, raw", 89, 1.1, 22.8, 0.3],
  ["apple", "Apple, with skin", 52, 0.3, 13.8, 0.2],
  ["broccoli", "Broccoli, cooked", 35, 2.4, 7.2, 0.4],
  ["avocado", "Avocado, raw", 160, 2, 8.5, 14.7],
  ["chickpeas", "Chickpeas, cooked", 164, 8.9, 27.4, 2.6],
  ["almonds", "Almonds, raw", 579, 21.2, 21.6, 49.9],
  ["whole-wheat-bread", "Whole wheat bread", 247, 13, 41, 4.2],
].map(([slug, description, calories, protein, carbs, fat]) => ({
  id: `curated:${slug}`,
  source: "curated_fallback",
  sourceFoodId: slug,
  description,
  brandName: "Nordic Nutri curated fallback",
  dataType: "Curated",
  category: "Generic Foods",
  servingSize: 100,
  servingUnit: "g",
  caloriesKcalPer100g: calories,
  proteinGPer100g: protein,
  carbsGPer100g: carbs,
  fatGPer100g: fat,
  imageUrl: null,
  sourceUrl: null,
}));

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

function normalizeImageUrl(value) {
  const url = typeof value === "string" ? value.trim() : "";
  return /^https:\/\/images\.openfoodfacts\.org\//i.test(url) ? url : null;
}

function attachFoodImages(foods, products, query) {
  const normalizedQuery = query.toLowerCase();
  const validProducts = Array.isArray(products) ? products
    .map((product) => ({
      productName: typeof product?.productName === "string" ? product.productName.trim() : "",
      imageUrl: normalizeImageUrl(product?.imageUrl),
    }))
    .filter((product) => product.productName && product.imageUrl) : [];
  return foods.map((food) => {
    const description = food.description.toLowerCase();
    const image = validProducts.find((product) =>
      description.includes(product.productName.toLowerCase())
      || product.productName.toLowerCase().includes(normalizedQuery),
    );
    return image ? { ...food, imageUrl: image.imageUrl } : food;
  });
}

function hasUsableNutrition(food) {
  return [
    food.caloriesKcalPer100g,
    food.proteinGPer100g,
    food.carbsGPer100g,
    food.fatGPer100g,
  ].some((value) => typeof value === "number" && Number.isFinite(value) && value > 0);
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
    async listRecent(limit = 80) {
      const result = await db.from("food_catalog")
        .select("*")
        .order("synced_at", { ascending: false })
        .limit(limit);
      if (result.error) throw new Error("Food cache discovery failed");
      return result.data ?? [];
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

function requestOpenFoodFactsSearch(query) {
  const params = new URLSearchParams({
    search_terms: query,
    search_simple: "1",
    action: "process",
    json: "1",
    page_size: String(PAGE_SIZE),
    fields: "product_name,image_front_small_url,image_small_url",
  });
  const requestUrl = `https://world.openfoodfacts.org/cgi/search.pl?${params}`;
  return new Promise((resolve, reject) => {
    const request = https.get(requestUrl, {
      timeout: 3000,
      headers: { "User-Agent": "NordicNutriAI/1.0 (food-catalog; support@nordicnutri.app)" },
    }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => {
        if (response.statusCode !== 200) return reject(new Error(`Open Food Facts search failed (${response.statusCode ?? 0})`));
        try {
          const data = JSON.parse(raw);
          resolve((Array.isArray(data?.products) ? data.products : []).map((product) => ({
            productName: product?.product_name,
            imageUrl: product?.image_front_small_url ?? product?.image_small_url,
          })));
        } catch {
          reject(new Error("Open Food Facts search response was invalid"));
        }
      });
    });
    request.on("timeout", () => request.destroy(new Error("Open Food Facts search timed out")));
    request.on("error", reject);
  });
}

function isFresh(row, now) {
  const syncedAt = new Date(row?.synced_at ?? row?.syncedAt ?? 0).getTime();
  return Number.isFinite(syncedAt) && now - syncedAt < CACHE_TTL_MS;
}

function shuffled(items, random) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(random() * (index + 1));
    [copy[index], copy[selected]] = [copy[selected], copy[index]];
  }
  return copy;
}

function fallbackItems(query) {
  const keyword = String(query ?? "").trim().toLowerCase();
  const matched = CURATED_FALLBACK_FOODS.filter((food) => (
    food.description.toLowerCase().includes(keyword)
    || food.sourceFoodId.includes(keyword)
  ));
  return matched.length ? matched : CURATED_FALLBACK_FOODS;
}

function createFoodCatalogService({ db, cache = db ? createDatabaseCache(db) : null, apiKey, searchUsda, searchImages = requestOpenFoodFactsSearch, translateQuery, now = Date.now, random = Math.random }) {
  if (!cache || typeof cache.search !== "function" || typeof cache.upsert !== "function") {
    throw new Error("Food catalog cache is unavailable");
  }
  const search = searchUsda ?? ((query, page) => requestUsdaSearch({ apiKey, query, page }));
  return {
    async search(_userId, query, page) {
      const normalizedQuery = normalizeQuery(query);
      const normalizedPage = normalizePage(page);
      let resolvedQuery = normalizedQuery;
      if (HAN_PATTERN.test(normalizedQuery) && typeof translateQuery === "function") {
        try {
          const translated = await translateQuery(normalizedQuery);
          if (typeof translated === "string" && translated.trim().length >= 2) resolvedQuery = translated;
        } catch {
          // The generic fallback below still supports a usable Chinese search.
        }
      }
      const searchableQuery = resolvedQuery.trim();
      let cached = [];
      try {
        cached = await cache.search(searchableQuery);
      } catch {
        // A temporary database cache fault must not make food search unavailable.
      }
      const currentTime = now();
      if (cached.length && cached.every((row) => isFresh(row, currentTime))) {
        const cachedItems = cached.map(mapCatalogRow).filter(Boolean);
        if (cachedItems.some((item) => !item.imageUrl)) {
          try {
            const enriched = attachFoodImages(cachedItems, await searchImages(searchableQuery), searchableQuery);
            const updated = await cache.upsert(enriched.filter((item) => item.imageUrl).map(toDatabaseRow));
            const byId = new Map(updated.map(mapCatalogRow).filter(Boolean).map((item) => [item.id, item]));
            return {
              items: cachedItems.map((item) => byId.get(item.id) ?? enriched.find((candidate) => candidate.sourceFoodId === item.sourceFoodId) ?? item),
              source: "cache",
              page: normalizedPage,
              resolvedQuery: searchableQuery,
            };
          } catch {
            // Existing nutrient data remains usable when optional image enrichment fails.
          }
        }
        return { items: cachedItems, source: "cache", page: normalizedPage, resolvedQuery: searchableQuery };
      }

      let foods;
      try {
        foods = await search(searchableQuery, normalizedPage);
      } catch (error) {
        if (cached.length) return { items: cached.map(mapCatalogRow).filter(Boolean), source: "cache-stale", page: normalizedPage, resolvedQuery: searchableQuery };
        return { items: fallbackItems(searchableQuery).slice(0, PAGE_SIZE), source: "fallback", page: normalizedPage, resolvedQuery: searchableQuery };
      }
      const mappedFoods = foods.map(mapUsdaFood).filter(Boolean).filter(hasUsableNutrition).slice(0, PAGE_SIZE);
      let foodsWithImages = mappedFoods;
      try {
        foodsWithImages = attachFoodImages(mappedFoods, await searchImages(searchableQuery), searchableQuery);
      } catch {
        // Food images are optional enrichment and must not block nutrient lookup.
      }
      const rows = foodsWithImages.map(toDatabaseRow);
      let persisted;
      try {
        persisted = await cache.upsert(rows);
      } catch {
        // USDA nutrients remain usable even when the optional local cache is unavailable.
        persisted = foodsWithImages.map(toDatabaseRow).map((row) => ({ ...row, id: row.source_food_id }));
      }
      return {
        items: persisted.map(mapCatalogRow).filter(Boolean),
        source: "usda_fdc",
        page: normalizedPage,
        resolvedQuery: searchableQuery,
      };
    },
    async discover(_userId) {
      let cachedItems = [];
      if (typeof cache.listRecent === "function") {
        try {
          cachedItems = (await cache.listRecent(80)).map(mapCatalogRow).filter(hasUsableNutrition);
        } catch {
          // The fallback list remains available if the cache cannot be read.
        }
      }
      const combined = [...cachedItems, ...CURATED_FALLBACK_FOODS.filter((fallback) => !cachedItems.some((item) => item.sourceFoodId === fallback.sourceFoodId))];
      return {
        items: shuffled(combined, random).slice(0, 10),
        source: cachedItems.length ? "cache" : "fallback",
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
  CURATED_FALLBACK_FOODS,
  PAGE_SIZE,
  PublicFoodCatalogError,
  createFoodCatalogService,
  mapCatalogRow,
  mapUsdaFood,
  requestOpenFoodFactsSearch,
  requestUsdaSearch,
};
