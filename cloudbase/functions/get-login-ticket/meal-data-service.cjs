class PublicMealDataError extends Error {
  constructor(code, message = "餐食数据无效") {
    super(message);
    this.code = code;
  }
}

const mealTypes = new Set(["breakfast", "lunch", "dinner", "snack"]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalid(message = "餐食数据无效") {
  return new PublicMealDataError("MEAL_DATA_INVALID", message);
}

function assertUuid(value, field) {
  if (typeof value !== "string" || !uuidPattern.test(value)) throw invalid(`${field}无效`);
  return value;
}

function assertNumber(value) {
  if (!Number.isFinite(value) || value < 0 || value > 2000) throw invalid();
  return value;
}

function normalizePortionMultiplier(value, fallback = null) {
  if (value == null) return fallback;
  const multiplier = assertNumber(value);
  if (multiplier < 0.25 || multiplier > 2 || Math.abs(multiplier * 4 - Math.round(multiplier * 4)) > 0.001) {
    throw invalid("份量比例无效");
  }
  return multiplier;
}

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) throw invalid();
  return items.map((item) => {
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    if (!name || name.length > 100) throw invalid();
    const quantityG = assertNumber(item.quantityG);
    if (quantityG <= 0) throw invalid();
    const aiQuantityG = item.aiQuantityG == null ? null : assertNumber(item.aiQuantityG);
    if (aiQuantityG != null && aiQuantityG <= 0) throw invalid();
    return {
      name,
      quantityG,
      aiQuantityG,
      caloriesPer100g: assertNumber(item.caloriesPer100g),
      proteinPer100g: assertNumber(item.proteinPer100g),
      carbsPer100g: assertNumber(item.carbsPer100g),
      fatPer100g: assertNumber(item.fatPer100g),
    };
  });
}

/** Store durable short paths only — cloud file IDs or short https URLs (DB max 512). */
function normalizeStoredImagePath(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 512) return null;
  if (/^cloud:\/\//i.test(trimmed)) return trimmed;
  // Ephemeral device / WeChat temp paths are not durable across sessions.
  if (/^(wxfile:|http:\/\/tmp|https:\/\/tmp)/i.test(trimmed)) return null;
  if (/^https:\/\//i.test(trimmed)) return trimmed;
  return null;
}

function normalizeMealInput(input) {
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 100 || !mealTypes.has(input?.mealType)) throw invalid();
  const recordedAt = typeof input.recordedAt === "string" ? new Date(input.recordedAt) : null;
  if (!recordedAt || Number.isNaN(recordedAt.getTime())) throw invalid();
  const imageUrl = normalizeStoredImagePath(input.imagePath) || normalizeStoredImagePath(input.imageUrl);
  return {
    clientRequestId: assertUuid(input.clientRequestId, "请求 ID"),
    analysisId: input.analysisId == null ? null : assertUuid(input.analysisId, "分析 ID"),
    mealType: input.mealType,
    name,
    recordedAt: recordedAt.toISOString(),
    isFavorite: Boolean(input.isFavorite),
    portionMultiplier: normalizePortionMultiplier(input.portionMultiplier, 1),
    imageUrl,
    items: normalizeItems(input.items),
  };
}

function mapItem(row, imageUrl = null) {
  return {
    id: row.id,
    name: row.name,
    quantityG: Number(row.confirmed_quantity_g),
    aiQuantityG: row.ai_quantity_g == null ? null : Number(row.ai_quantity_g),
    caloriesPer100g: Number(row.calories_per_100g),
    proteinPer100g: Number(row.protein_g_per_100g),
    carbsPer100g: Number(row.carbs_g_per_100g),
    fatPer100g: Number(row.fat_g_per_100g),
    foodId: row.food_id ?? null,
    imageUrl: imageUrl ?? null,
  };
}

function mapMeal(row, itemRows, imageByFoodId = new Map()) {
  return {
    id: row.id,
    userId: row.user_id,
    analysisId: row.analysis_id ?? null,
    clientRequestId: row.client_request_id ?? null,
    mealType: row.meal_type,
    name: row.name,
    recordedAt: row.recorded_at,
    isFavorite: Boolean(row.is_favorite),
    portionMultiplier: row.portion_multiplier == null ? null : Number(row.portion_multiplier),
    imageUrl: row.image_path ?? null,
    insight: typeof row.insight === "string" && row.insight.trim() ? row.insight.trim() : null,
    caloriesKcal: Number(row.calories_kcal ?? 0),
    proteinG: Number(row.protein_g ?? 0),
    carbsG: Number(row.carbs_g ?? 0),
    fatG: Number(row.fat_g ?? 0),
    items: itemRows.map((item) => mapItem(item, imageByFoodId.get(item.food_id) ?? null)),
  };
}

function nextDate(date) {
  const value = new Date(`${date}T00:00:00+08:00`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(value.getTime())) throw invalid("日期无效");
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString();
}

function assertDateRange(from, to) {
  nextDate(from);
  nextDate(to);
  const start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  const days = Math.round((end.getTime() - start.getTime()) / 86400000);
  if (days < 0 || days > 31) throw invalid("日期范围无效");
}

function createMealDataService({
  db,
  analyze,
  model = "deepseek-v4-flash",
  resolveImageUrl,
  generateMealInsight,
  getNutritionPlan,
  onMealMutation,
}) {
  if (!db || typeof db.from !== "function") throw new Error("Meal database is unavailable");

  async function withResolvedImage(meal) {
    if (!meal?.imageUrl || typeof resolveImageUrl !== "function") return meal;
    if (!/^cloud:\/\//i.test(meal.imageUrl)) {
      // Drop non-https leftovers (e.g. stale wxfile) so UI shows the food icon fallback.
      if (/^(wxfile:|http:\/\/tmp|https:\/\/tmp)/i.test(meal.imageUrl)) {
        return { ...meal, imageUrl: null };
      }
      return meal;
    }
    try {
      const url = await resolveImageUrl(meal.imageUrl);
      // Unresolvable cloud refs render as broken <Image>; prefer explicit empty thumb.
      return { ...meal, imageUrl: url && /^https:\/\//i.test(url) ? url : null };
    } catch (err) {
      console.error("[meals] resolveImageUrl failed:", err?.message || err);
      return { ...meal, imageUrl: null };
    }
  }

  /** Bound concurrency so range lists do not stampede temp-URL resolution. */
  async function mapWithConcurrency(items, concurrency, mapper) {
    if (!items.length) return [];
    const limit = Math.max(1, Math.min(concurrency, items.length));
    const results = new Array(items.length);
    let nextIndex = 0;
    async function worker() {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index], index);
      }
    }
    await Promise.all(Array.from({ length: limit }, () => worker()));
    return results;
  }

  async function resolveInsight({ analysisId, userId, mealName, items, existingInsight, allowGenerate = true }) {
    if (typeof existingInsight === "string" && existingInsight.trim()) return existingInsight.trim().slice(0, 1000);
    if (analysisId) {
      const analysis = await db.from("ai_analysis").select("advice").eq("id", analysisId).eq("user_id", userId).maybeSingle();
      if (analysis.error) throw new Error("Meal analysis read failed");
      const advice = typeof analysis.data?.advice === "string" ? analysis.data.advice.trim() : "";
      if (advice) return advice.slice(0, 1000);
    }
    if (!allowGenerate || typeof generateMealInsight !== "function") return null;
    try {
      const generated = await generateMealInsight({
        userId,
        mealName,
        items: items.map((item) => ({
          name: item.name,
          quantityG: item.quantityG,
          caloriesPer100g: item.caloriesPer100g,
          proteinPer100g: item.proteinPer100g,
          carbsPer100g: item.carbsPer100g,
          fatPer100g: item.fatPer100g,
        })),
      });
      if (typeof generated === "string" && generated.trim()) return generated.trim().slice(0, 1000);
      if (generated && typeof generated === "object" && typeof generated.insight === "string" && generated.insight.trim()) {
        return generated.insight.trim().slice(0, 1000);
      }
    } catch (error) {
      console.warn("[meals] insight generation failed:", error?.message || error);
    }
    return null;
  }

  async function notifyMealMutation(userId, recordedAt) {
    if (typeof onMealMutation !== "function") return;
    try {
      await onMealMutation({ userId, recordedAt });
    } catch (error) {
      // Meal persistence is already committed. Streak reconciliation is
      // recoverable and must never turn a successful save/edit/delete into a
      // failed meal request.
      console.warn("[meals] milestone reconciliation failed:", error?.message || error);
    }
  }

  function scheduleBackgroundInsight(userId, mealId, itemRows, record) {
    void (async () => {
      try {
        const existingInsight = typeof record.insight === "string" ? record.insight.trim() : "";
        if (existingInsight) return;
        const generated = await resolveInsight({
          analysisId: record.analysis_id ?? null,
          userId,
          mealName: record.name,
          items: itemRows.map((row) => ({
            name: row.name,
            quantityG: Number(row.confirmed_quantity_g),
            caloriesPer100g: Number(row.calories_per_100g),
            proteinPer100g: Number(row.protein_g_per_100g),
            carbsPer100g: Number(row.carbs_g_per_100g),
            fatPer100g: Number(row.fat_g_per_100g),
          })),
          allowGenerate: true,
        });
        if (generated) {
          await db.from("meal_records").update({ insight: generated }).eq("id", mealId).eq("user_id", userId).is("deleted_at", null);
        }
      } catch (error) {
        console.warn("[meals] background insight failed:", error?.message || error);
      }
    })();
  }

  async function getMeal(userId, mealId, options = {}) {
    const hydrate = Boolean(options?.hydrate);
    const record = await db.from("meal_records").select("*").eq("id", mealId).eq("user_id", userId).is("deleted_at", null).maybeSingle();
    if (record.error) throw new Error("Meal read failed");
    if (!record.data) return null;
    const itemsResult = await db.from("meal_items").select("*").eq("meal_record_id", mealId).order("created_at", { ascending: true });
    if (itemsResult.error) throw new Error("Meal item read failed");
    const itemRows = itemsResult.data ?? [];

    if (hydrate) {
      let insight = typeof record.data.insight === "string" ? record.data.insight.trim() : "";
      if (!insight) {
        // Fast path: reuse analysis advice from DB only. DeepSeek generation runs in background.
        const fromAnalysis = await resolveInsight({
          analysisId: record.data.analysis_id ?? null,
          userId,
          mealName: record.data.name,
          items: itemRows.map((row) => ({
            name: row.name,
            quantityG: Number(row.confirmed_quantity_g),
            caloriesPer100g: Number(row.calories_per_100g),
            proteinPer100g: Number(row.protein_g_per_100g),
            carbsPer100g: Number(row.carbs_g_per_100g),
            fatPer100g: Number(row.fat_g_per_100g),
          })),
          allowGenerate: false,
        });
        if (fromAnalysis) {
          insight = fromAnalysis;
          const saved = await db.from("meal_records").update({ insight }).eq("id", mealId).eq("user_id", userId).is("deleted_at", null).select("*").maybeSingle();
          if (!saved.error && saved.data) record.data = saved.data;
          else record.data = { ...record.data, insight };
        }
      }

      if (!(typeof record.data.insight === "string" && record.data.insight.trim())) {
        scheduleBackgroundInsight(userId, mealId, itemRows, record.data);
      }
    }

    return withResolvedImage(mapMeal(record.data, itemRows));
  }

  return {
    async createAnalysis(userId, input) {
      if (typeof analyze !== "function") throw new PublicMealDataError("MEAL_ANALYSIS_UNAVAILABLE", "餐食分析暂不可用");
      const clientRequestId = assertUuid(input?.clientRequestId, "请求 ID");
      const result = await analyze({ items: input?.items, userId });
      const saved = await db.from("ai_analysis").insert({
        user_id: userId,
        provider: "deepseek",
        model,
        status: "completed",
        raw_recognition: result,
        normalized_items: result.items,
        advice: result.advice || null,
        client_request_id: clientRequestId,
      }).select("*").single();
      if (saved.error || !saved.data) throw new Error("Meal analysis save failed");
      return {
        id: saved.data.id,
        mealName: result.mealName,
        advice: result.advice,
        items: result.items,
      };
    },

    async listMeals(userId, date, options = {}) {
      return this.listMealsRange(userId, date, date, options);
    },

    async listMealsRange(userId, from, to, options = {}) {
      assertDateRange(from, to);
      const resolveImages = options.resolveImages !== false;
      const until = nextDate(to);
      const records = await db.from("meal_records").select("*").eq("user_id", userId).is("deleted_at", null)
        .gte("recorded_at", `${from}T00:00:00+08:00`).lt("recorded_at", until).order("recorded_at", { ascending: true });
      if (records.error) throw new Error("Meal list failed");
      const rows = records.data ?? [];
      if (!rows.length) return [];
      const mealIds = rows.map((row) => row.id);
      const itemsResult = await db.from("meal_items").select("*").in("meal_record_id", mealIds).order("created_at", { ascending: true });
      if (itemsResult.error) throw new Error("Meal item read failed");
      const itemsByMeal = new Map();
      for (const item of itemsResult.data ?? []) {
        const list = itemsByMeal.get(item.meal_record_id) ?? [];
        list.push(item);
        itemsByMeal.set(item.meal_record_id, list);
      }
      const meals = rows.map((record) => mapMeal(record, itemsByMeal.get(record.id) ?? []));
      if (!resolveImages) return meals;
      return mapWithConcurrency(meals, 4, (meal) => withResolvedImage(meal));
    },

    async countMeals(userId) {
      const result = await db.from("meal_records").select("id", { count: "exact", head: true })
        .eq("user_id", userId).is("deleted_at", null);
      if (result.error) throw new Error("Meal count failed");
      return Number(result.count) || 0;
    },

    async createMeal(userId, input) {
      const meal = normalizeMealInput(input);
      const existing = await db.from("meal_records").select("id").eq("user_id", userId).eq("client_request_id", meal.clientRequestId).maybeSingle();
      if (existing.error) throw new Error("Meal request lookup failed");
      if (existing.data?.id) {
        const prior = await getMeal(userId, existing.data.id);
        if (!prior) throw new Error("Meal request conflict");
        return prior;
      }
      let imagePath = meal.imageUrl;
      if (meal.analysisId) {
        const analysis = await db.from("ai_analysis").select("id,image_path,advice").eq("id", meal.analysisId).eq("user_id", userId).maybeSingle();
        if (analysis.error || !analysis.data?.id) throw invalid("分析记录无效");
        if (!imagePath || !/^cloud:\/\//i.test(imagePath)) {
          const analysisPath = normalizeStoredImagePath(analysis.data.image_path);
          if (analysisPath && /^cloud:\/\//i.test(analysisPath)) imagePath = analysisPath;
        }
      }
      // Sync path: reuse analysis advice only. DeepSeek meal insight runs in background.
      const insight = await resolveInsight({
        analysisId: meal.analysisId,
        userId,
        mealName: meal.name,
        items: meal.items,
        allowGenerate: false,
      });
      // Bind the immutable plan version that was active when this meal was
      // saved. Historical milestones later read this relation instead of the
      // user's current plan after it has been adjusted.
      let activePlan = null;
      if (typeof getNutritionPlan === "function") {
        try {
          activePlan = await getNutritionPlan(userId);
        } catch (error) {
          // A plan association enriches historical milestone analysis, but a
          // temporary plan read failure must never turn a successful meal save
          // into a failure. Phase 2 reconciles the missing association when
          // it calculates any pending milestone snapshot.
          console.warn("[meal] active nutrition plan lookup failed:", error?.message || error);
        }
      }
      const created = await db.from("meal_records").insert({
        user_id: userId,
        plan_id: activePlan?.id ?? null,
        analysis_id: meal.analysisId,
        client_request_id: meal.clientRequestId,
        meal_type: meal.mealType,
        name: meal.name,
        recorded_at: meal.recordedAt,
        is_favorite: meal.isFavorite,
        portion_multiplier: meal.portionMultiplier,
        image_path: imagePath,
        insight,
      }).select("*").single();
      if (created.error || !created.data?.id) throw new Error("Meal save failed");
      // Meal items stay on the meal only — do not auto-create/link catalog foods.
      const itemRows = meal.items.map((item) => ({
        meal_record_id: created.data.id,
        name: item.name,
        ai_quantity_g: item.aiQuantityG ?? item.quantityG,
        confirmed_quantity_g: item.quantityG,
        calories_per_100g: item.caloriesPer100g,
        protein_g_per_100g: item.proteinPer100g,
        carbs_g_per_100g: item.carbsPer100g,
        fat_g_per_100g: item.fatPer100g,
        food_id: null,
      }));
      const itemResult = await db.from("meal_items").insert(itemRows).select("*");
      if (itemResult.error) throw new Error("Meal item save failed");
      const savedItems = itemResult.data ?? itemRows;
      if (!insight) {
        scheduleBackgroundInsight(userId, created.data.id, savedItems, { ...created.data, image_path: imagePath });
      }
      const result = await withResolvedImage(mapMeal({ ...created.data, image_path: imagePath, insight }, savedItems));
      await notifyMealMutation(userId, result.recordedAt);
      return result;
    },

    async updateMeal(userId, mealId, input) {
      assertUuid(mealId, "餐食 ID");
      const changes = {};
      if (input?.name !== undefined) {
        const name = typeof input.name === "string" ? input.name.trim() : "";
        if (!name || name.length > 100) throw invalid();
        changes.name = name;
      }
      if (input?.mealType !== undefined) {
        if (!mealTypes.has(input.mealType)) throw invalid();
        changes.meal_type = input.mealType;
      }
      if (input?.recordedAt !== undefined) {
        const recordedAt = new Date(input.recordedAt);
        if (Number.isNaN(recordedAt.getTime())) throw invalid();
        changes.recorded_at = recordedAt.toISOString();
      }
      if (input?.isFavorite !== undefined) changes.is_favorite = Boolean(input.isFavorite);
      if (input?.portionMultiplier !== undefined) changes.portion_multiplier = normalizePortionMultiplier(input.portionMultiplier);
      const current = await getMeal(userId, mealId);
      if (!current) return null;
      if (input?.items !== undefined) {
        const items = normalizeItems(input.items);
        const deleted = await db.from("meal_items").delete().eq("meal_record_id", mealId);
        if (deleted.error) throw new Error("Meal item clear failed");
        const savedItems = await db.from("meal_items").insert(items.map((item) => ({
          meal_record_id: mealId, name: item.name, ai_quantity_g: item.aiQuantityG ?? item.quantityG, confirmed_quantity_g: item.quantityG,
          calories_per_100g: item.caloriesPer100g, protein_g_per_100g: item.proteinPer100g,
          carbs_g_per_100g: item.carbsPer100g, fat_g_per_100g: item.fatPer100g,
          food_id: null,
        }))).select("*");
        if (savedItems.error) throw new Error("Meal item update failed");
        if (!current.insight) {
          const insight = await resolveInsight({
            analysisId: current.analysisId,
            userId,
            mealName: changes.name || current.name,
            items,
            allowGenerate: false,
          });
          if (insight) changes.insight = insight;
        }
      }
      if (Object.keys(changes).length) {
        const saved = await db.from("meal_records").update(changes).eq("id", mealId).eq("user_id", userId).is("deleted_at", null).select("*").maybeSingle();
        if (saved.error || !saved.data) throw new Error("Meal update failed");
      }
      const updated = await getMeal(userId, mealId);
      if (updated && !updated.insight && input?.items !== undefined) {
        scheduleBackgroundInsight(
          userId,
          mealId,
          (updated.items || []).map((item) => ({
            name: item.name,
            confirmed_quantity_g: item.quantityG,
            calories_per_100g: item.caloriesPer100g,
            protein_g_per_100g: item.proteinPer100g,
            carbs_g_per_100g: item.carbsPer100g,
            fat_g_per_100g: item.fatPer100g,
          })),
          {
            analysis_id: updated.analysisId,
            name: updated.name,
            insight: null,
          },
        );
      }
      if (updated) await notifyMealMutation(userId, updated.recordedAt);
      return updated;
    },

    async deleteMeal(userId, mealId) {
      assertUuid(mealId, "餐食 ID");
      const current = await db.from("meal_records").select("recorded_at").eq("id", mealId).eq("user_id", userId).is("deleted_at", null).maybeSingle();
      if (current.error) throw new Error("Meal read failed");
      if (!current.data) return false;
      const deleted = await db.from("meal_records").update({ deleted_at: new Date().toISOString() })
        .eq("id", mealId).eq("user_id", userId).is("deleted_at", null).select("id").maybeSingle();
      if (deleted.error) throw new Error("Meal delete failed");
      const didDelete = Boolean(deleted.data?.id);
      if (didDelete) await notifyMealMutation(userId, current.data.recorded_at);
      return didDelete;
    },

    getMeal,
  };
}

module.exports = { createMealDataService, PublicMealDataError, normalizeStoredImagePath };
