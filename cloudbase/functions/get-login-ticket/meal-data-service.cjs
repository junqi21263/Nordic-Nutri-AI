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

function normalizeItems(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 20) throw invalid();
  return items.map((item) => {
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    if (!name || name.length > 100) throw invalid();
    const quantityG = assertNumber(item.quantityG);
    if (quantityG <= 0) throw invalid();
    return {
      name,
      quantityG,
      caloriesPer100g: assertNumber(item.caloriesPer100g),
      proteinPer100g: assertNumber(item.proteinPer100g),
      carbsPer100g: assertNumber(item.carbsPer100g),
      fatPer100g: assertNumber(item.fatPer100g),
    };
  });
}

function normalizeMealInput(input) {
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 100 || !mealTypes.has(input?.mealType)) throw invalid();
  const recordedAt = typeof input.recordedAt === "string" ? new Date(input.recordedAt) : null;
  if (!recordedAt || Number.isNaN(recordedAt.getTime())) throw invalid();
  return {
    clientRequestId: assertUuid(input.clientRequestId, "请求 ID"),
    analysisId: input.analysisId == null ? null : assertUuid(input.analysisId, "分析 ID"),
    mealType: input.mealType,
    name,
    recordedAt: recordedAt.toISOString(),
    isFavorite: Boolean(input.isFavorite),
    items: normalizeItems(input.items),
  };
}

function mapItem(row) {
  return {
    id: row.id,
    name: row.name,
    quantityG: Number(row.confirmed_quantity_g),
    aiQuantityG: row.ai_quantity_g == null ? null : Number(row.ai_quantity_g),
    caloriesPer100g: Number(row.calories_per_100g),
    proteinPer100g: Number(row.protein_g_per_100g),
    carbsPer100g: Number(row.carbs_g_per_100g),
    fatPer100g: Number(row.fat_g_per_100g),
  };
}

function mapMeal(row, itemRows) {
  return {
    id: row.id,
    userId: row.user_id,
    analysisId: row.analysis_id ?? null,
    clientRequestId: row.client_request_id ?? null,
    mealType: row.meal_type,
    name: row.name,
    recordedAt: row.recorded_at,
    isFavorite: Boolean(row.is_favorite),
    caloriesKcal: Number(row.calories_kcal ?? 0),
    proteinG: Number(row.protein_g ?? 0),
    carbsG: Number(row.carbs_g ?? 0),
    fatG: Number(row.fat_g ?? 0),
    items: itemRows.map(mapItem),
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

function createMealDataService({ db, analyze, model = "deepseek-v4-flash" }) {
  if (!db || typeof db.from !== "function") throw new Error("Meal database is unavailable");

  async function getMeal(userId, mealId) {
    const record = await db.from("meal_records").select("*").eq("id", mealId).eq("user_id", userId).is("deleted_at", null).maybeSingle();
    if (record.error) throw new Error("Meal read failed");
    if (!record.data) return null;
    const items = await db.from("meal_items").select("*").eq("meal_record_id", mealId).order("created_at", { ascending: true });
    if (items.error) throw new Error("Meal item read failed");
    return mapMeal(record.data, items.data ?? []);
  }

  return {
    async createAnalysis(userId, input) {
      if (typeof analyze !== "function") throw new PublicMealDataError("MEAL_ANALYSIS_UNAVAILABLE", "餐食分析暂不可用");
      const clientRequestId = assertUuid(input?.clientRequestId, "请求 ID");
      const result = await analyze({ items: input?.items });
      const saved = await db.from("ai_analysis").insert({
        user_id: userId,
        provider: "deepseek",
        model,
        status: "succeeded",
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

    async listMeals(userId, date) {
      return this.listMealsRange(userId, date, date);
    },

    async listMealsRange(userId, from, to) {
      assertDateRange(from, to);
      const until = nextDate(to);
      const records = await db.from("meal_records").select("*").eq("user_id", userId).is("deleted_at", null)
        .gte("recorded_at", `${from}T00:00:00+08:00`).lt("recorded_at", until).order("recorded_at", { ascending: true });
      if (records.error) throw new Error("Meal list failed");
      const result = [];
      for (const record of records.data ?? []) {
        const meal = await getMeal(userId, record.id);
        if (meal) result.push(meal);
      }
      return result;
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
      if (meal.analysisId) {
        const analysis = await db.from("ai_analysis").select("id").eq("id", meal.analysisId).eq("user_id", userId).maybeSingle();
        if (analysis.error || !analysis.data?.id) throw invalid("分析记录无效");
      }
      const created = await db.from("meal_records").insert({
        user_id: userId,
        analysis_id: meal.analysisId,
        client_request_id: meal.clientRequestId,
        meal_type: meal.mealType,
        name: meal.name,
        recorded_at: meal.recordedAt,
        is_favorite: meal.isFavorite,
      }).select("*").single();
      if (created.error || !created.data?.id) throw new Error("Meal save failed");
      const itemRows = meal.items.map((item) => ({
        meal_record_id: created.data.id,
        name: item.name,
        ai_quantity_g: item.quantityG,
        confirmed_quantity_g: item.quantityG,
        calories_per_100g: item.caloriesPer100g,
        protein_g_per_100g: item.proteinPer100g,
        carbs_g_per_100g: item.carbsPer100g,
        fat_g_per_100g: item.fatPer100g,
      }));
      const itemResult = await db.from("meal_items").insert(itemRows).select("*");
      if (itemResult.error) throw new Error("Meal item save failed");
      return mapMeal(created.data, itemResult.data ?? itemRows);
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
      const current = await getMeal(userId, mealId);
      if (!current) return null;
      if (Object.keys(changes).length) {
        const saved = await db.from("meal_records").update(changes).eq("id", mealId).eq("user_id", userId).is("deleted_at", null).select("*").maybeSingle();
        if (saved.error || !saved.data) throw new Error("Meal update failed");
      }
      if (input?.items !== undefined) {
        const items = normalizeItems(input.items);
        const deleted = await db.from("meal_items").delete().eq("meal_record_id", mealId);
        if (deleted.error) throw new Error("Meal item clear failed");
        const savedItems = await db.from("meal_items").insert(items.map((item) => ({
          meal_record_id: mealId, name: item.name, ai_quantity_g: item.quantityG, confirmed_quantity_g: item.quantityG,
          calories_per_100g: item.caloriesPer100g, protein_g_per_100g: item.proteinPer100g,
          carbs_g_per_100g: item.carbsPer100g, fat_g_per_100g: item.fatPer100g,
        }))).select("*");
        if (savedItems.error) throw new Error("Meal item update failed");
      }
      return getMeal(userId, mealId);
    },

    async deleteMeal(userId, mealId) {
      assertUuid(mealId, "餐食 ID");
      const deleted = await db.from("meal_records").update({ deleted_at: new Date().toISOString() })
        .eq("id", mealId).eq("user_id", userId).is("deleted_at", null).select("id").maybeSingle();
      if (deleted.error) throw new Error("Meal delete failed");
      return Boolean(deleted.data?.id);
    },

    getMeal,
  };
}

module.exports = { createMealDataService, PublicMealDataError };
