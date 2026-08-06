const CATEGORY_CODES = new Set([
  "meat", "seafood", "egg", "dairy", "soy", "grain", "vegetable", "fruit", "beverage", "seasoning", "mixed_dish", "other",
]);

function normalizeFoodName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace(/[（(].*?[）)]/g, "")
    .toLowerCase()
    .trim();
}

function createDeepseekFoodClassifyService({ apiKey, model, fetchImpl = globalThis.fetch, requestCompletion } = {}) {
  const { extractContentAndUsage } = require("./model-usage.cjs");
  const selectedModel = typeof model === "string" && model.trim() ? model.trim() : "deepseek-v4-flash";
  const complete = requestCompletion ?? (async ({ name, macros }) => {
    if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("DeepSeek configuration is incomplete");
    if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetchImpl("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          thinking: { type: "disabled" },
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [{
            role: "system",
            content: `你是食材分类助手。仅返回 JSON：{"categoryCode":"<code>"}。code 必须是其一：${[...CATEGORY_CODES].join(",")}。不得提供医疗建议。`,
          }, {
            role: "user",
            content: JSON.stringify({ name, macros }),
          }],
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("FOOD_CLASSIFY_RETRYABLE");
      const data = await response.json();
      const parsed = extractContentAndUsage(data);
      const content = typeof parsed.content === "string" ? JSON.parse(parsed.content) : parsed.content;
      return { payload: content, usage: parsed.usage, model: selectedModel };
    } finally {
      clearTimeout(timer);
    }
  });

  return async ({ name, macros }) => {
    try {
      const raw = await complete({ name, macros });
      const payload = raw && typeof raw === "object" && "payload" in raw ? raw.payload : raw;
      const code = typeof payload?.categoryCode === "string" ? payload.categoryCode.trim() : "";
      return {
        categoryCode: CATEGORY_CODES.has(code) ? code : "other",
        usage: raw?.usage || null,
        model: raw?.model || selectedModel,
      };
    } catch {
      return { categoryCode: "other", usage: null, model: selectedModel };
    }
  };
}

function createDeepseekMealInsightService({ apiKey, model, fetchImpl = globalThis.fetch, requestCompletion } = {}) {
  const { extractContentAndUsage } = require("./model-usage.cjs");
  const selectedModel = typeof model === "string" && model.trim() ? model.trim() : "deepseek-v4-flash";
  const complete = requestCompletion ?? (async ({ mealName, items }) => {
    if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("DeepSeek configuration is incomplete");
    if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetchImpl("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          thinking: { type: "disabled" },
          temperature: 0.3,
          response_format: { type: "json_object" },
          messages: [{
            role: "system",
            content: "你是北欧营养教练。仅返回 JSON：{\"insight\":\"...\"}。insight 用中文，1-2 句，说明这餐对今日目标的影响与下一步建议，不超过 120 字。不得提供医疗诊断。",
          }, {
            role: "user",
            content: JSON.stringify({ mealName, items }),
          }],
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("MEAL_INSIGHT_RETRYABLE");
      const data = await response.json();
      const parsed = extractContentAndUsage(data);
      const content = typeof parsed.content === "string" ? JSON.parse(parsed.content) : parsed.content;
      return { payload: content, usage: parsed.usage, model: selectedModel };
    } finally {
      clearTimeout(timer);
    }
  });

  return async ({ mealName, items }) => {
    const raw = await complete({ mealName, items });
    const payload = raw && typeof raw === "object" && "payload" in raw ? raw.payload : raw;
    const insight = typeof payload?.insight === "string" ? payload.insight.trim().slice(0, 1000) : "";
    if (!insight) throw new Error("MEAL_INSIGHT_EMPTY");
    if (typeof raw === "string") return insight;
    return { insight, usage: raw?.usage || null, model: raw?.model || selectedModel };
  };
}

function createMealFoodLinkService({ db, classifyFoodCategory, enqueueFoodImage }) {
  if (!db || typeof db.from !== "function") throw new Error("Meal food link database is unavailable");

  async function findCategoryId(code) {
    const result = await db.from("food_categories").select("id,code").eq("code", code).eq("is_active", true).maybeSingle();
    if (result.error) throw new Error("Food category lookup failed");
    return result.data?.id ?? null;
  }

  async function findFoodByNormalizedName(normalizedName, displayName) {
    const byNormalized = await db.from("foods").select("id,name_zh,normalized_name,primary_image_id,image_status")
      .eq("normalized_name", normalizedName).eq("is_active", true).limit(1).maybeSingle();
    if (byNormalized.error) throw new Error("Food lookup failed");
    if (byNormalized.data?.id) return byNormalized.data;

    const exactName = typeof displayName === "string" ? displayName.trim() : "";
    if (exactName) {
      const byZh = await db.from("foods").select("id,name_zh,normalized_name,primary_image_id,image_status")
        .eq("name_zh", exactName).eq("is_active", true).limit(1).maybeSingle();
      if (byZh.error) throw new Error("Food lookup failed");
      if (byZh.data?.id) return byZh.data;
    }
    return null;
  }

  async function createFoodFromItem(item, categoryCode) {
    const normalizedName = normalizeFoodName(item.name);
    const categoryId = await findCategoryId(categoryCode || "other") || await findCategoryId("other");
    const sourceId = `ai-scan:${normalizedName}`.slice(0, 128);
    const row = {
      source: "ai_scan",
      source_id: sourceId,
      name_zh: item.name.slice(0, 160),
      normalized_name: normalizedName.slice(0, 240),
      category_id: categoryId,
      calories: item.caloriesPer100g,
      protein_g: item.proteinPer100g,
      carbs_g: item.carbsPer100g,
      fat_g: item.fatPer100g,
      nutrition_basis: "per_100g",
      image_entity_key: sourceId,
      image_status: "missing",
      publish_status: "published",
      is_active: true,
      is_primary_variant: true,
      search_keywords: [item.name],
      quality_score: 0,
      is_verified: false,
      is_featured: false,
    };
    const saved = await db.from("foods").upsert(row, { onConflict: "source,source_id" }).select("*").limit(1).maybeSingle();
    if (saved.error || !saved.data?.id) throw new Error("Food create failed");
    if (typeof enqueueFoodImage === "function") {
      try { await enqueueFoodImage(saved.data.id, sourceId); } catch (error) {
        console.warn("[meal-food-link] enqueue image failed:", error?.message || error);
      }
    }
    return saved.data;
  }

  async function resolveItemFood(item, { createMissing = true } = {}) {
    const normalizedName = normalizeFoodName(item.name);
    if (!normalizedName) return { foodId: null, imageUrl: null };
    try {
      let food = await findFoodByNormalizedName(normalizedName, item.name);
      if (!food?.id) {
        if (!createMissing) return { foodId: null, imageUrl: null };
        let categoryCode = "other";
        if (typeof classifyFoodCategory === "function") {
          const classified = await classifyFoodCategory({
            name: item.name,
            macros: {
              caloriesPer100g: item.caloriesPer100g,
              proteinPer100g: item.proteinPer100g,
              carbsPer100g: item.carbsPer100g,
              fatPer100g: item.fatPer100g,
            },
          });
          categoryCode = typeof classified === "string"
            ? classified
            : (classified?.categoryCode || "other");
        }
        food = await createFoodFromItem(item, categoryCode);
      }
      return { foodId: food.id, imageUrl: null, food };
    } catch (error) {
      console.warn("[meal-food-link] resolve failed:", error?.message || error);
      return { foodId: null, imageUrl: null };
    }
  }

  async function loadFoodImageUrls(foodIds) {
    const ids = [...new Set((foodIds || []).filter(Boolean))];
    if (!ids.length) return new Map();
    const images = await db.from("food_images").select("food_id,thumb_url,medium_url,detail_url,storage_path,status,is_primary,review_status")
      .in("food_id", ids).eq("is_primary", true).eq("status", "ready");
    if (images.error) throw new Error("Food image lookup failed");
    const map = new Map();
    for (const row of images.data ?? []) {
      if (row.review_status && row.review_status !== "approved") continue;
      const url = row.thumb_url || row.medium_url || row.detail_url || row.storage_path || null;
      if (url) map.set(row.food_id, url);
    }
    return map;
  }

  async function resolveItems(items, options = {}) {
    const createMissing = options.createMissing !== false;
    const resolvedLinks = await Promise.all((items || []).map((item) => resolveItemFood(item, { createMissing })));
    const resolved = (items || []).map((item, index) => ({
      ...item,
      foodId: resolvedLinks[index]?.foodId ?? null,
    }));
    const imageMap = await loadFoodImageUrls(resolved.map((item) => item.foodId));
    return resolved.map((item) => ({
      ...item,
      imageUrl: item.foodId ? (imageMap.get(item.foodId) ?? null) : null,
    }));
  }

  return { normalizeFoodName, resolveItems, loadFoodImageUrls, CATEGORY_CODES };
}

module.exports = {
  normalizeFoodName,
  createDeepseekFoodClassifyService,
  createDeepseekMealInsightService,
  createMealFoodLinkService,
  CATEGORY_CODES,
};
