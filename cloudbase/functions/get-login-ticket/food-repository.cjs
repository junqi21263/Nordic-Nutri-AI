// food-repository.cjs
// Data access layer for the unified food model. All DB access goes through the
// CloudBase RDB client (db.from(...)). Returns plain camelCase rows; never
// leaks third-party raw payloads to callers.

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

class FoodRepositoryError extends Error {
  constructor(code) { super(code); this.code = code; }
}

function clampPage(page) {
  const n = Number(page);
  if (!Number.isInteger(n) || n < 1) return 1;
  return Math.min(n, 1000);
}

function clampPageSize(pageSize) {
  const n = Number(pageSize);
  if (!Number.isInteger(n) || n < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(n, MAX_PAGE_SIZE);
}

function toCamelNutrition(row) {
  return {
    calories: Number(row.calories) || 0,
    protein: Number(row.protein_g) || 0,
    carbs: Number(row.carbs_g) || 0,
    fat: Number(row.fat_g) || 0,
    fiber: row.fiber_g == null ? null : Number(row.fiber_g),
    sugar: row.sugar_g == null ? null : Number(row.sugar_g),
    sodium: row.sodium_mg == null ? null : Number(row.sodium_mg),
  };
}

const VARIANT_LABEL_ZH = new Map([
  ["raw", "生食"], ["cooked", "熟制"], ["boiled", "水煮"],
  ["baked", "烘烤"], ["roasted", "烤制"], ["fried", "煎炸"],
  ["grilled", "烧烤"], ["frozen", "冷冻"], ["canned", "罐装"],
  ["dried", "干制"], ["smoked", "烟熏"],
]);

function mapVariantLabel(row) {
  const value = row?.variant_label_zh ?? null;
  if (!value) return null;
  return VARIANT_LABEL_ZH.get(String(value).trim().toLowerCase()) ?? value;
}

function mapFoodRow(row, { category, tags, image } = {}) {
  if (!row?.id) return null;
  return {
    id: row.id,
    source: row.source,
    sourceId: row.source_id,
    fdcId: row.fdc_id == null ? null : Number(row.fdc_id),
    barcode: row.barcode ?? null,
    nameZh: row.name_zh ?? null,
    nameEn: row.name_en ?? null,
    normalizedName: row.normalized_name ?? null,
    brandName: row.brand_name ?? null,
    description: row.description ?? null,
    category: category ?? null,
    tags: tags ?? [],
    image: image
      ? {
          thumbnailUrl: image.thumbnailUrl || image.thumbUrl || "",
          listUrl: image.listUrl || image.mediumUrl || image.thumbUrl || "",
          detailUrl: image.detailUrl || image.mediumUrl || image.thumbUrl || "",
          source: image.source || "fallback",
          isFallback: Boolean(image.isFallback),
        }
      : null,
    // Legacy flat field for older mini-program list rows.
    imageUrl: image?.listUrl || image?.thumbUrl || image?.detailUrl || null,
    servingSize: row.serving_size == null ? null : Number(row.serving_size),
    servingUnit: row.serving_unit ?? null,
    nutritionBasis: row.nutrition_basis ?? "per_100g",
    nutritionPer100g: toCamelNutrition(row),
    imageEntityKey: row.image_entity_key ?? null,
    primaryImageId: row.primary_image_id ?? null,
    imageStatus: row.image_status ?? (row.primary_image_id ? "ready" : "missing"),
    imageQualityScore: row.image_quality_score == null ? null : Number(row.image_quality_score),
    recommendationWeight: Number(row.recommendation_weight) || 0,
    popularityScore: Number(row.popularity_score) || 0,
    qualityScore: Number(row.quality_score) || 0,
    isFeatured: Boolean(row.is_featured),
    isVerified: Boolean(row.is_verified),
    isActive: Boolean(row.is_active),
    sourceUpdatedAt: row.raw_source_updated_at ?? null,
    publishStatus: row.publish_status ?? null,
    foodKind: row.food_kind ?? "ingredient",
    foodForm: row.food_form ?? null,
    defaultCookingMethod: row.default_cooking_method ?? null,
    imagePolicy: row.image_policy ?? "none",
    imageSubjectZh: row.image_subject_zh ?? null,
    catalogVersion: row.catalog_version ?? null,
    foodGroupId: row.food_group_id ?? null,
    isPrimaryVariant: row.is_primary_variant !== false,
    variantLabelZh: mapVariantLabel(row),
    createdAt: row.created_at ?? null,
    updatedAt: row.updated_at ?? null,
  };
}

function mapCategoryRow(row) {
  if (!row?.id) return null;
  return {
    id: row.id, code: row.code, nameZh: row.name_zh, nameEn: row.name_en,
    icon: row.icon ?? null, sortOrder: Number(row.sort_order) || 0,
    isActive: Boolean(row.is_active),
  };
}

function mapTagRow(row) {
  if (!row?.id) return null;
  return {
    id: row.id, code: row.code, nameZh: row.name_zh, nameEn: row.name_en,
    ruleConfig: row.rule_config ?? {}, sortOrder: Number(row.sort_order) || 0,
    isActive: Boolean(row.is_active),
  };
}

function mapImageRow(row) {
  if (!row?.id) return null;
  const thumbUrl = row.thumb_url ?? null;
  const mediumUrl = row.medium_url ?? null;
  const detailUrl = row.detail_url ?? null;
  const source = row.source;
  const reviewStatus = row.review_status
    ?? (row.status === "ready" ? "approved" : row.status === "rejected" ? "rejected" : "pending");
  const isFallback = source === "fallback" || row.image_type === "placeholder" || (!thumbUrl && !mediumUrl && !detailUrl);
  return {
    id: row.id,
    foodId: row.food_id ?? null,
    imageEntityKey: row.image_entity_key ?? null,
    imageType: row.image_type,
    source,
    sourceUrl: row.source_url ?? null,
    storagePath: row.storage_path ?? null,
    originalFileId: row.original_file_id ?? null,
    originalUrl: row.original_url ?? null,
    thumbUrl,
    mediumUrl,
    detailUrl,
    thumbnailUrl: thumbUrl,
    listUrl: mediumUrl || thumbUrl,
    mimeType: row.mime_type ?? null,
    width: row.width ?? null,
    height: row.height ?? null,
    fileSize: row.file_size == null ? null : Number(row.file_size),
    contentHash: row.content_hash ?? null,
    license: row.license ?? null,
    attribution: row.attribution ?? null,
    qualityScore: row.quality_score == null ? null : Number(row.quality_score),
    foodMatchScore: row.food_match_score == null ? null : Number(row.food_match_score),
    styleScore: row.style_score == null ? null : Number(row.style_score),
    modelName: row.model_name ?? null,
    prompt: row.prompt ?? null,
    revisedPrompt: row.revised_prompt ?? null,
    seed: row.seed == null ? null : Number(row.seed),
    reviewStatus,
    rejectReason: row.reject_reason ?? null,
    jobId: row.job_id ?? null,
    isPrimary: Boolean(row.is_primary),
    isVerified: Boolean(row.is_verified),
    status: row.status,
    uploadedBy: row.uploaded_by ?? null,
    isFallback,
    image: {
      thumbnailUrl: thumbUrl || "",
      listUrl: mediumUrl || thumbUrl || "",
      detailUrl: detailUrl || mediumUrl || thumbUrl || "",
      source: source || "fallback",
      isFallback,
    },
  };
}

function buildSearchFilter(query) {
  const q = sanitizeFilterTerm(query);
  if (!q) return null;
  // PostgREST OR filter across name_zh, name_en, normalized_name, search_keywords.
  return `or=(name_zh.ilike.*${q}*,name_en.ilike.*${q}*,normalized_name.ilike.*${q}*,search_keywords.cs.{${q}})`;
}

/**
 * Strip characters that break PostgREST `.or()` / `.ilike.` filter syntax
 * (commas separate OR clauses; dots/parens are operators). USDA descriptions
 * like "Beef, cured, corned beef, canned" must not be interpolated raw.
 */
function sanitizeFilterTerm(raw, { maxLength = 48 } = {}) {
  const normalized = String(raw ?? "")
    .trim()
    .toLowerCase()
    // Prefer the primary name before USDA comma lists ("Beef, cured, ..." → "Beef").
    .split(",")[0]
    .replace(/[().*\\]/g, " ")
    .replace(/[^a-z0-9\u3400-\u9fff\s-]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  return normalized.slice(0, maxLength).trim();
}

function sanitizeCategoryCode(raw) {
  const value = String(raw ?? "").trim().toLowerCase();
  return /^[a-z0-9_]+(?:\.[a-z0-9_]+)*$/.test(value) ? value : "";
}

const REGIONAL_CATEGORY_CODES = new Set(["nordic_staples", "north_american_staples"]);

function sortClause(sort) {
  switch (sort) {
    case "popular": return { column: "popularity_score", ascending: false };
    case "protein_desc": return { column: "protein_g", ascending: false };
    case "calories_asc": return { column: "calories", ascending: true };
    case "created_desc": return { column: "created_at", ascending: false };
    case "recommended":
    default: return { column: "popularity_score", ascending: false };
  }
}

async function loadCategoriesByIds(db, ids) {
  if (!ids.length) return new Map();
  const result = await db.from("food_categories").select("*").in("id", ids);
  if (result.error) throw new FoodRepositoryError("FOOD_CATEGORY_LOOKUP_FAILED");
  return new Map((result.data ?? []).map((r) => [r.id, mapCategoryRow(r)]));
}

async function loadTagsForFoods(db, foodIds) {
  if (!foodIds.length) return new Map();
  const relResult = await db.from("food_tag_relations").select("food_id,tag_id").in("food_id", foodIds);
  if (relResult.error) throw new FoodRepositoryError("FOOD_TAG_LOOKUP_FAILED");
  const tagIds = Array.from(new Set((relResult.data ?? []).map((r) => r.tag_id)));
  const tagMap = new Map();
  if (tagIds.length) {
    const tags = await db.from("food_tags").select("*").in("id", tagIds);
    if (tags.error) throw new FoodRepositoryError("FOOD_TAG_LOOKUP_FAILED");
    for (const t of tags.data ?? []) tagMap.set(t.id, mapTagRow(t));
  }
  const byFood = new Map();
  for (const rel of relResult.data ?? []) {
    const tag = tagMap.get(rel.tag_id);
    if (tag) {
      if (!byFood.has(rel.food_id)) byFood.set(rel.food_id, []);
      byFood.get(rel.food_id).push(tag);
    }
  }
  return byFood;
}

async function loadPrimaryImagesForFoods(db, foodIds) {
  if (!foodIds.length) return new Map();
  const result = await db.from("food_images")
    .select("*")
    .in("food_id", foodIds)
    .eq("is_primary", true)
    .eq("status", "ready");
  if (result.error) throw new FoodRepositoryError("FOOD_IMAGE_LOOKUP_FAILED");
  // Only expose approved / ready primaries — pending Hunyuan candidates stay hidden.
  const rows = (result.data ?? []).filter((r) => !r.review_status || r.review_status === "approved");
  return new Map(rows.map((r) => [r.food_id, mapImageRow(r)]));
}

function createFoodRepository({ db }) {
  if (!db || typeof db.from !== "function") throw new Error("Food repository requires an RDB client");

  return {
    async listCategories() {
      const result = await db.from("food_categories").select("*").eq("is_active", true).order("sort_order", { ascending: true });
      if (result.error) throw new FoodRepositoryError("FOOD_CATEGORY_LOOKUP_FAILED");
      return (result.data ?? []).map(mapCategoryRow).filter(Boolean);
    },

    async listTags() {
      const result = await db.from("food_tags").select("*").eq("is_active", true).order("sort_order", { ascending: true });
      if (result.error) throw new FoodRepositoryError("FOOD_TAG_LOOKUP_FAILED");
      return (result.data ?? []).map(mapTagRow).filter(Boolean);
    },

    async listFoods({ q, categoryCode, tagCodes, source, featured, sort, page, pageSize } = {}) {
      const p = clampPage(page);
      const size = clampPageSize(pageSize);
      const offset = (p - 1) * size;
      let regionalTotal = null;
      let regionalPageIds = null;
      let query = db.from("foods").select("*", { count: "exact" })
        .eq("is_active", true)
        .eq("publish_status", "published")
        // New imports default to true; grouped variants are backfilled false.
        .eq("is_primary_variant", true);
      const filter = buildSearchFilter(q);
      if (filter) query = query.or(filter.slice(4, -1)); // strip "or=(" wrapper -> `.or()` accepts comma-separated clauses
      if (featured) query = query.eq("is_featured", true);
      if (source) query = query.eq("source", source);
      if (categoryCode) {
        const code = sanitizeCategoryCode(categoryCode);
        if (!code) throw new FoodRepositoryError("FOOD_CATEGORY_INVALID");
        if (REGIONAL_CATEGORY_CODES.has(code)) {
          const memberships = await db.from("food_region_memberships")
            .select("food_id", { count: "exact" })
            .eq("region_code", code)
            .limit(1);
          if (memberships.error) throw new FoodRepositoryError("FOOD_CATEGORY_INVALID");
          regionalTotal = Number(memberships.count ?? 0);
          const pageMemberships = await db.from("food_region_memberships")
            .select("food_id")
            .eq("region_code", code)
            .order("food_id", { ascending: true })
            .range(offset, offset + size - 1);
          if (pageMemberships.error) throw new FoodRepositoryError("FOOD_CATEGORY_INVALID");
          regionalPageIds = (pageMemberships.data ?? []).map((row) => row.food_id).filter(Boolean);
          if (!regionalPageIds.length) return {
            items: [],
            pagination: { page: p, pageSize: size, total: regionalTotal, hasMore: false },
          };
          query = query.in("id", regionalPageIds);
        } else {
          const categories = await db.from("food_categories").select("id").ilike("code", `${code}%`);
          if (categories.error) throw new FoodRepositoryError("FOOD_CATEGORY_INVALID");
          const categoryIds = (categories.data ?? []).map((category) => category.id).filter(Boolean);
          if (!categoryIds.length) return {
            items: [],
            pagination: { page: p, pageSize: size, total: 0, hasMore: false },
          };
          query = query.in("category_id", categoryIds);
        }
      }
      const order = sortClause(sort);
      query = query
        .range(regionalPageIds ? 0 : offset, regionalPageIds ? size - 1 : offset + size - 1)
        .order(order.column, { ascending: order.ascending });
      const result = await query;
      if (result.error) throw new FoodRepositoryError("FOOD_LIST_FAILED");
      const rows = result.data ?? [];
      const foodIds = rows.map((r) => r.id);
      const catIds = Array.from(new Set(rows.map((r) => r.category_id).filter(Boolean)));
      const [catMap, tagMap, imageMap] = await Promise.all([
        loadCategoriesByIds(db, catIds),
        loadTagsForFoods(db, foodIds),
        loadPrimaryImagesForFoods(db, foodIds),
      ]);
      // Tag filter (AND: food must have all tagCodes).
      let items = rows.map((r) => mapFoodRow(r, {
        category: r.category_id ? catMap.get(r.category_id) : null,
        tags: tagMap.get(r.id) ?? [],
        image: imageMap.get(r.id) ?? null,
      }));
      if (Array.isArray(tagCodes) && tagCodes.length) {
        const wanted = new Set(tagCodes);
        items = items.filter((f) => wanted.size === 0 || wanted.size <= f.tags.length && f.tags.some((t) => wanted.has(t.code)));
      }
      const total = regionalTotal ?? Number(result.count ?? items.length);
      return {
        items,
        pagination: { page: p, pageSize: size, total, hasMore: offset + size < total },
      };
    },

    async getFoodById(id) {
      const result = await db.from("foods").select("*")
        .eq("id", id)
        .eq("publish_status", "published")
        .maybeSingle();
      if (result.error) throw new FoodRepositoryError("FOOD_LOOKUP_FAILED");
      if (!result.data) return null;
      const row = result.data;
      const [catMap, tagMap, imageMap] = await Promise.all([
        loadCategoriesByIds(db, row.category_id ? [row.category_id] : []),
        loadTagsForFoods(db, [row.id]),
        loadPrimaryImagesForFoods(db, [row.id]),
      ]);
      return mapFoodRow(row, {
        category: row.category_id ? catMap.get(row.category_id) : null,
        tags: tagMap.get(row.id) ?? [],
        image: imageMap.get(row.id) ?? null,
      });
    },

    async listFoodVariants(id) {
      const selected = await db.from("foods").select("*")
        .eq("id", id)
        .eq("is_active", true)
        .eq("publish_status", "published")
        .maybeSingle();
      if (selected.error) throw new FoodRepositoryError("FOOD_LOOKUP_FAILED");
      if (!selected.data) return [];

      const groupId = selected.data.food_group_id;
      const result = groupId
        ? await db.from("foods").select("*")
          .eq("food_group_id", groupId)
          .eq("is_active", true)
          .eq("publish_status", "published")
          .order("is_primary_variant", { ascending: false })
        : { data: [selected.data], error: null };
      if (result.error) throw new FoodRepositoryError("FOOD_VARIANT_LOOKUP_FAILED");
      const rows = result.data ?? [];
      const foodIds = rows.map((row) => row.id);
      const categoryIds = Array.from(new Set(rows.map((row) => row.category_id).filter(Boolean)));
      const [categoryMap, tagMap, imageMap] = await Promise.all([
        loadCategoriesByIds(db, categoryIds),
        loadTagsForFoods(db, foodIds),
        loadPrimaryImagesForFoods(db, foodIds),
      ]);
      return rows.map((row) => mapFoodRow(row, {
        category: row.category_id ? categoryMap.get(row.category_id) : null,
        tags: tagMap.get(row.id) ?? [],
        image: imageMap.get(row.id) ?? null,
      })).filter(Boolean);
    },

    async getFoodByFdcId(fdcId) {
      const result = await db.from("foods").select("*").eq("fdc_id", fdcId).maybeSingle();
      if (result.error) throw new FoodRepositoryError("FOOD_LOOKUP_FAILED");
      return result.data ? result.data.id : null;
    },

    async getFoodByBarcode(barcode) {
      const result = await db.from("foods").select("*").eq("barcode", barcode).maybeSingle();
      if (result.error) throw new FoodRepositoryError("FOOD_LOOKUP_FAILED");
      return result.data ?? null;
    },

    async suggestions(q, limit = 8) {
      const query = sanitizeFilterTerm(q);
      if (query.length < 1) return [];
      const result = await db.from("foods")
        .select("id,name_zh,name_en,normalized_name,brand_name,calories,protein_g")
        .eq("is_active", true)
        .eq("publish_status", "published")
        .eq("is_primary_variant", true)
        .or(`name_zh.ilike.*${query}*,name_en.ilike.*${query}*,normalized_name.ilike.*${query}*`)
        .order("popularity_score", { ascending: false })
        .limit(Math.min(Math.max(Number(limit) || 8, 1), 10));
      if (result.error) throw new FoodRepositoryError("FOOD_SUGGESTION_FAILED");
      return (result.data ?? []).map((r) => ({
        id: r.id, nameZh: r.name_zh, nameEn: r.name_en, brandName: r.brand_name,
        calories: Number(r.calories) || 0, protein: Number(r.protein_g) || 0,
      }));
    },

    async upsertFood(record) {
      const row = {
        source: record.source,
        source_id: record.sourceId,
        fdc_id: record.fdcId ?? null,
        barcode: record.barcode ?? null,
        name_zh: record.nameZh ?? null,
        name_en: record.nameEn ?? null,
        normalized_name: record.normalizedName,
        brand_name: record.brandName ?? null,
        description: record.description ?? null,
        category_id: record.categoryId ?? null,
        serving_size: record.servingSize ?? null,
        serving_unit: record.servingUnit ?? null,
        calories: record.calories ?? 0,
        protein_g: record.proteinG ?? 0,
        carbs_g: record.carbsG ?? 0,
        fat_g: record.fatG ?? 0,
        fiber_g: record.fiberG ?? null,
        sugar_g: record.sugarG ?? null,
        sodium_mg: record.sodiumMg ?? null,
        nutrition_basis: record.nutritionBasis ?? "per_100g",
        image_entity_key: record.imageEntityKey ?? record.sourceId,
        search_keywords: record.searchKeywords ?? [],
        quality_score: record.qualityScore ?? 0,
        is_verified: record.isVerified ?? false,
        is_featured: record.isFeatured ?? false,
        is_active: true,
        raw_source_updated_at: record.rawSourceUpdatedAt ?? null,
      };
      const result = await db.from("foods")
        .upsert(row, { onConflict: "source,source_id" })
        .select("*")
        .limit(1)
        .maybeSingle();
      if (result.error) throw new FoodRepositoryError("FOOD_UPSERT_FAILED");
      return result.data;
    },

    async bindTags(foodId, tagCodes, source = "rule") {
      if (!Array.isArray(tagCodes) || !tagCodes.length) return;
      const tags = await db.from("food_tags").select("id,code").in("code", tagCodes);
      if (tags.error || !tags.data?.length) return;
      const rows = tags.data.map((t) => ({ food_id: foodId, tag_id: t.id, source }));
      await db.from("food_tag_relations").upsert(rows, { onConflict: "food_id,tag_id" });
    },

    async incrementPopularity(foodId) {
      await db.from("foods").update({ popularity_score: db.raw?.("popularity_score + 1") ?? "popularity_score + 1" }).eq("id", foodId);
    },

    async listMissingImages(limit = 50) {
      const result = await db.from("foods")
        .select("id,name_zh,name_en,source,source_id,image_entity_key,category_id")
        .eq("is_active", true)
        .is("primary_image_id", null)
        .order("popularity_score", { ascending: false })
        .limit(Math.min(Math.max(Number(limit) || 50, 1), 200));
      if (result.error) throw new FoodRepositoryError("FOOD_MISSING_IMAGES_FAILED");
      return result.data ?? [];
    },

    async createImageTask(foodId, imageEntityKey, sourcePriority) {
      const result = await db.from("food_image_tasks").upsert({
        food_id: foodId, image_entity_key: imageEntityKey, source_priority: sourcePriority, status: "pending",
      }, { onConflict: "food_id,image_entity_key,source_priority" }).select("*").maybeSingle();
      return result.data ?? null;
    },

    async insertImage(record) {
      const result = await db.from("food_images").insert(record).select("*").maybeSingle();
      if (result.error) throw new FoodRepositoryError("FOOD_IMAGE_INSERT_FAILED");
      return result.data ? mapImageRow(result.data) : null;
    },

    async setPrimaryImage(foodId, imageId) {
      await db.from("food_images").update({ is_primary: false }).eq("food_id", foodId).eq("is_primary", true);
      await db.from("food_images").update({
        is_primary: true,
        is_verified: true,
        status: "ready",
        review_status: "approved",
        image_type: "primary",
      }).eq("id", imageId).eq("food_id", foodId);
      await db.from("foods").update({
        primary_image_id: imageId,
        image_status: "ready",
      }).eq("id", foodId);
    },

    async saveSourcePayload({ foodId, source, sourceId, rawPayload, ttlSeconds }) {
      const expiresAt = ttlSeconds ? new Date(Date.now() + ttlSeconds * 1000).toISOString() : null;
      await db.from("food_source_payloads").upsert({
        food_id: foodId, source, source_id: sourceId, raw_payload: rawPayload, expires_at: expiresAt,
      }, { onConflict: "source,source_id" });
    },

    async createSyncJob(record) {
      const result = await db.from("food_sync_jobs").insert({
        job_type: record.jobType, source: record.source, status: record.status ?? "pending",
        request_payload: record.requestPayload ?? null, started_at: record.startedAt ?? null,
      }).select("*").maybeSingle();
      return result.data ?? null;
    },

    async finishSyncJob(jobId, summary) {
      await db.from("food_sync_jobs").update({
        status: summary.status, result_summary: summary.resultSummary ?? null,
        total_count: summary.totalCount ?? 0, success_count: summary.successCount ?? 0,
        failed_count: summary.failedCount ?? 0, error_message: summary.errorMessage ?? null,
        finished_at: new Date().toISOString(),
      }).eq("id", jobId);
    },

    async listSyncJobs(limit = 20) {
      const result = await db.from("food_sync_jobs").select("*").order("created_at", { ascending: false }).limit(Math.min(Number(limit) || 20, 100));
      if (result.error) throw new FoodRepositoryError("FOOD_SYNC_JOBS_FAILED");
      return result.data ?? [];
    },

    async reviewImage(imageId, { status, isVerified, isPrimary, foodId }) {
      const patch = { status };
      if (typeof isVerified === "boolean") patch.is_verified = isVerified;
      await db.from("food_images").update(patch).eq("id", imageId);
      if (isPrimary && foodId) await this.setPrimaryImage(foodId, imageId);
    },

    async updateFood(id, patch) {
      const allowed = {};
      for (const k of ["name_zh","name_en","brand_name","description","category_id","serving_size","serving_unit","calories","protein_g","carbs_g","fat_g","fiber_g","sugar_g","sodium_mg","is_featured","is_verified","is_active"]) {
        if (k in patch) allowed[k] = patch[k];
      }
      if (Object.keys(allowed).length) await db.from("foods").update(allowed).eq("id", id);
    },

    async isAdmin(userId) {
      const result = await db.from("app_users").select("is_admin").eq("id", userId).maybeSingle();
      return Boolean(result.data?.is_admin);
    },
  };
}

module.exports = {
  DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, FoodRepositoryError,
  clampPage, clampPageSize, mapFoodRow, mapCategoryRow, mapTagRow, mapImageRow,
  toCamelNutrition, sanitizeFilterTerm, sanitizeCategoryCode, REGIONAL_CATEGORY_CODES, createFoodRepository,
};
