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
  // 肉禽
  ["chicken-breast", "Chicken breast, cooked", 165, 31, 0, 3.6],
  ["beef", "Beef, lean, cooked", 217, 26.1, 0, 11.8],
  ["pork", "Pork loin, cooked", 242, 27.3, 0, 14],
  ["turkey", "Turkey breast, cooked", 135, 30, 0, 0.7],
  // 鱼虾海鲜
  ["salmon", "Salmon, Atlantic, cooked", 206, 22.1, 0, 12.4],
  ["shrimp", "Shrimp, cooked", 99, 24, 0.2, 0.3],
  ["tuna", "Tuna, canned in water", 86, 19, 0, 0.8],
  ["cod", "Cod, cooked", 105, 23, 0, 0.9],
  // 蛋类
  ["egg", "Egg, whole, cooked", 155, 12.6, 1.1, 10.6],
  ["egg-white", "Egg white, raw", 52, 11, 0.7, 0.2],
  // 乳制品
  ["greek-yogurt", "Greek yogurt, plain", 97, 9, 3.9, 5],
  ["milk", "Milk, low fat", 50, 3.4, 5, 1.9],
  ["cheddar", "Cheese, cheddar", 403, 25, 1.3, 33],
  ["cottage-cheese", "Cottage cheese, low fat", 72, 12, 2.7, 1],
  // 豆制品
  ["tofu", "Tofu, firm", 144, 17.3, 2.8, 8.7],
  ["chickpeas", "Chickpeas, cooked", 164, 8.9, 27.4, 2.6],
  ["lentils", "Lentils, cooked", 116, 9, 20, 0.4],
  ["edamame", "Edamame, cooked", 121, 12, 9, 5],
  // 谷物
  ["oatmeal", "Oatmeal, cooked", 71, 2.5, 12, 1.5],
  ["rice", "Rice, white, cooked", 130, 2.4, 28.2, 0.3],
  ["potato", "Potato, baked", 93, 2.5, 21.2, 0.1],
  ["whole-wheat-bread", "Whole wheat bread", 247, 13, 41, 4.2],
  ["quinoa", "Quinoa, cooked", 120, 4.4, 21.3, 1.9],
  // 蔬菜
  ["broccoli", "Broccoli, cooked", 35, 2.4, 7.2, 0.4],
  ["spinach", "Spinach, cooked", 23, 3, 3.6, 0.3],
  ["carrot", "Carrot, raw", 41, 0.9, 9.6, 0.2],
  ["tomato", "Tomato, raw", 18, 0.9, 3.9, 0.2],
  // 水果
  ["banana", "Banana, raw", 89, 1.1, 22.8, 0.3],
  ["apple", "Apple, with skin", 52, 0.3, 13.8, 0.2],
  ["blueberry", "Blueberries, raw", 57, 0.7, 14.5, 0.3],
  ["avocado", "Avocado, raw", 160, 2, 8.5, 14.7],
  ["strawberry", "Strawberries, raw", 32, 0.7, 7.7, 0.3],
  // 饮料 / 调味 / 其他
  ["orange-juice", "Orange juice", 45, 0.7, 10.4, 0.2],
  ["olive-oil", "Olive oil", 884, 0, 0, 100],
  ["almonds", "Almonds, raw", 579, 21.2, 21.6, 49.9],
  ["peanut-butter", "Peanut butter", 588, 25, 20, 50],
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
  // USDA often lists Energy in kJ first; convert when no kcal row was preferred.
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
  // Foundation / SR Legacy nutrients are already per 100g.
  if (!dataType || /foundation|sr legacy|survey/i.test(dataType)) return value;
  const size = Number(servingSize);
  const unit = String(servingUnit || "").toLowerCase();
  if (!Number.isFinite(size) || size <= 0) return value;
  if (unit !== "g" && unit !== "ml" && unit !== "gram" && unit !== "grams") return value;
  if (Math.abs(size - 100) < 0.01) return value;
  return Math.round((value / size) * 100 * 100) / 100;
}

function mapUsdaFood(food) {
  const sourceFoodId = Number.isInteger(food?.fdcId) || typeof food?.fdcId === "string" ? String(food.fdcId) : "";
  const description = typeof food?.description === "string" ? food.description.trim() : "";
  if (!sourceFoodId || !description) return null;
  const dataType = typeof food.dataType === "string" && food.dataType.trim() ? food.dataType.trim() : null;
  const servingSize = numberOrNull(food.servingSize);
  const servingUnit = typeof food.servingSizeUnit === "string" && food.servingSizeUnit.trim() ? food.servingSizeUnit.trim() : null;
  const rawCalories = nutrientValue(food, "Energy", { preferUnit: "KCAL" });
  const rawProtein = nutrientValue(food, "Protein");
  const rawCarbs = nutrientValue(food, "Carbohydrate, by difference");
  const rawFat = nutrientValue(food, "Total lipid (fat)");
  return {
    source: "usda_fdc",
    sourceFoodId,
    description,
    brandName: typeof food.brandOwner === "string" && food.brandOwner.trim() ? food.brandOwner.trim() : null,
    dataType,
    category: typeof food.foodCategory === "string" && food.foodCategory.trim() ? food.foodCategory.trim() : null,
    servingSize,
    servingUnit,
    caloriesKcalPer100g: scaleBrandedToPer100g(rawCalories, servingSize, servingUnit, dataType),
    proteinGPer100g: scaleBrandedToPer100g(rawProtein, servingSize, servingUnit, dataType),
    carbsGPer100g: scaleBrandedToPer100g(rawCarbs, servingSize, servingUnit, dataType),
    fatGPer100g: scaleBrandedToPer100g(rawFat, servingSize, servingUnit, dataType),
    imageUrl: null,
    sourceUrl: `https://fdc.nal.usda.gov/food-details/${sourceFoodId}/nutrients`,
  };
}

function normalizeImageUrl(value) {
  const url = typeof value === "string" ? value.trim() : "";
  return /^https:\/\/([a-z0-9.-]+\.)?openfoodfacts\.org\//i.test(url) ? url : null;
}

function extractSearchKeyword(description) {
  const words = String(description ?? "")
    .toLowerCase()
    .split(/[\s,./()-]+/)
    .filter((word) => word.length > 2);
  return words.slice(0, 3).join(" ") || String(description ?? "").slice(0, 24);
}

function pickBestImage(food, products) {
  const description = food.description.toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const product of products) {
    if (!product.imageUrl) continue;
    const name = product.productName.toLowerCase();
    const tokens = name.split(/[\s,./()-]+/).filter((token) => token.length > 2);
    let score = 0;
    for (const token of tokens) {
      if (description.includes(token)) score += token.length;
    }
    if (name.length > 2 && description.includes(name)) score += name.length * 2;
    if (score > bestScore) {
      bestScore = score;
      best = product.imageUrl;
    }
  }
  return bestScore > 0 ? best : null;
}

function attachFoodImages(foods, products, query = "") {
  const normalizedQuery = String(query).trim().toLowerCase();
  return foods.map((food) => {
    let imageUrl = pickBestImage(food, products);
    if (!imageUrl && normalizedQuery) {
      const fallback = products.find((product) => {
        const name = product.productName.toLowerCase();
        return name.includes(normalizedQuery) || normalizedQuery.includes(name);
      });
      imageUrl = fallback?.imageUrl ?? null;
    }
    return imageUrl ? { ...food, imageUrl } : food;
  });
}

async function enrichFoodImages(foods, searchImages, mirrorImage, limit = 12) {
  const targets = foods.filter((food) => !food.imageUrl).slice(0, limit);
  if (!targets.length) return foods;
  const byKey = new Map(foods.map((food) => [food.id ?? food.sourceFoodId, { ...food }]));
  await Promise.all(targets.map(async (food) => {
    const key = food.id ?? food.sourceFoodId;
    const query = extractSearchKeyword(food.description);
    try {
      const products = (await searchImages(query))
        .map((product) => ({
          productName: typeof product?.productName === "string" ? product.productName.trim() : "",
          imageUrl: normalizeImageUrl(product?.imageUrl),
        }))
        .filter((product) => product.productName && product.imageUrl);
      const enriched = attachFoodImages([food], products, query)[0];
      if (enriched.imageUrl && typeof mirrorImage === "function") {
        try {
          enriched.imageUrl = await mirrorImage(enriched.imageUrl, key);
        } catch {
          // Keep the external image when mirroring is unavailable.
        }
      }
      if (enriched.imageUrl) byKey.set(key, enriched);
    } catch {
      // Optional image enrichment must not block nutrient lookup.
    }
  }));
  return foods.map((food) => byKey.get(food.id ?? food.sourceFoodId) ?? food);
}

function hasUsableNutrition(food) {
  return [
    food.caloriesKcalPer100g,
    food.proteinGPer100g,
    food.carbsGPer100g,
    food.fatGPer100g,
  ].some((value) => typeof value === "number" && Number.isFinite(value) && value > 0);
}

/** Prefer reference datasets over branded products for nutrition backfill. */
function nutritionMatchRank(food) {
  const type = String(food?.dataType || "").toLowerCase();
  if (type.includes("foundation")) return 0;
  if (type.includes("sr legacy")) return 1;
  if (type.includes("survey") || type.includes("fndds")) return 2;
  if (type.includes("curated")) return 3;
  if (type.includes("branded")) return 5;
  return 4;
}

function pickBestNutritionMatch(foods) {
  const usable = foods.filter(hasUsableNutrition);
  if (!usable.length) return null;
  return [...usable].sort((left, right) => nutritionMatchRank(left) - nutritionMatchRank(right))[0];
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

function createFoodCatalogService({ db, cache = db ? createDatabaseCache(db) : null, apiKey, searchUsda, searchImages = requestOpenFoodFactsSearch, translateQuery, mirrorImage, now = Date.now, random = Math.random }) {
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
          const text = typeof translated === "string" ? translated : translated?.translation;
          if (typeof text === "string" && text.trim().length >= 2) resolvedQuery = text;
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
        // Return cached nutrients immediately. List images are resolved on the
        // client via category placeholders; we no longer call Open Food Facts
        // for keyword-based image enrichment on every search (slow + rate-limited).
        return {
          items: cached.map(mapCatalogRow).filter(Boolean),
          source: "cache",
          page: normalizedPage,
          resolvedQuery: searchableQuery,
        };
      }

      let foods;
      try {
        foods = await search(searchableQuery, normalizedPage);
      } catch (error) {
        if (cached.length) return { items: cached.map(mapCatalogRow).filter(Boolean), source: "cache-stale", page: normalizedPage, resolvedQuery: searchableQuery };
        return { items: fallbackItems(searchableQuery).slice(0, PAGE_SIZE), source: "fallback", page: normalizedPage, resolvedQuery: searchableQuery };
      }
      const mappedFoods = foods.map(mapUsdaFood).filter(Boolean).filter(hasUsableNutrition).slice(0, PAGE_SIZE);
      // No real-time image enrichment: nutrients are persisted without waiting on
      // Open Food Facts. Packaged goods get images via the barcode lookup path.
      const rows = mappedFoods.map(toDatabaseRow);
      let persisted;
      try {
        persisted = await cache.upsert(rows);
      } catch {
        // USDA nutrients remain usable even when the optional local cache is unavailable.
        persisted = rows.map((row) => ({ ...row, id: row.source_food_id }));
      }
      return {
        items: persisted.map(mapCatalogRow).filter(Boolean),
        source: "usda_fdc",
        page: normalizedPage,
        resolvedQuery: searchableQuery,
      };
    },
    async discover(_userId, requestedLimit = 10) {
      const limit = Number.isInteger(Number(requestedLimit))
        ? Math.max(1, Math.min(Number(requestedLimit), 100))
        : 10;
      let cachedItems = [];
      if (typeof cache.listRecent === "function") {
        try {
          cachedItems = (await cache.listRecent(Math.max(80, limit))).map(mapCatalogRow).filter(hasUsableNutrition);
        } catch {
          // The fallback list remains available if the cache cannot be read.
        }
      }
      const combined = [...cachedItems, ...CURATED_FALLBACK_FOODS.filter((fallback) => !cachedItems.some((item) => item.sourceFoodId === fallback.sourceFoodId))];
      // No real-time Open Food Facts enrichment on discovery: list thumbnails use
      // client-side category placeholders, so discovery stays fast and predictable.
      const items = shuffled(combined, random).slice(0, limit);
      return {
        items,
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
    /**
     * Lean nutrition-only lookup for vision backfill.
     * Skips image enrichment to stay fast. Returns the first USDA match with
     * usable per-100g nutrition, or null.
     */
    async lookupNutrition(query) {
      const normalizedQuery = normalizeQuery(query);
      let resolvedQuery = normalizedQuery;
      if (HAN_PATTERN.test(normalizedQuery) && typeof translateQuery === "function") {
        try {
          const translated = await translateQuery(normalizedQuery);
          const text = typeof translated === "string" ? translated : translated?.translation;
          if (typeof text === "string" && text.trim().length >= 2) resolvedQuery = text;
        } catch {
          // Fall through to search with the original query.
        }
      }
      const searchableQuery = resolvedQuery.trim();
      // Try cache first (fast path).
      try {
        const cached = await cache.search(searchableQuery);
        const cachedItems = cached.map(mapCatalogRow).filter(Boolean);
        const bestCached = pickBestNutritionMatch(cachedItems);
        if (bestCached) return bestCached;
      } catch {
        // Cache miss is expected; fall through to USDA.
      }
      // USDA live search (no image enrichment).
      try {
        const foods = await search(searchableQuery, 1);
        const mapped = foods.map(mapUsdaFood).filter(Boolean);
        const best = pickBestNutritionMatch(mapped);
        if (best) {
          try { await cache.upsert(mapped.filter(hasUsableNutrition).map(toDatabaseRow)); } catch {}
          return best;
        }
      } catch {
        // USDA unreachable; try fallback list.
      }
      return pickBestNutritionMatch(fallbackItems(searchableQuery));
    },
  };
}

module.exports = {
  CACHE_TTL_MS,
  CURATED_FALLBACK_FOODS,
  PAGE_SIZE,
  PublicFoodCatalogError,
  attachFoodImages,
  createFoodCatalogService,
  enrichFoodImages,
  mapCatalogRow,
  mapUsdaFood,
  pickBestNutritionMatch,
  requestOpenFoodFactsSearch,
  requestUsdaSearch,
};
