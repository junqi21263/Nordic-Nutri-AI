const { createDailyInsightHash, createDailyInsightService, createRuleInsight } = require("./daily-insight-service.cjs");
const {
  dietaryPatternLabel,
  foodAvoidanceLabels,
} = require("./diet-preference-labels.cjs");
const {
  calculateAchievements,
  calculateDailyNutrition,
  calculateWeeklyNutrition,
  dateKey,
} = require("./nutrition-calculation-service.cjs");
const {
  createFallbackWeeklyReview,
  createWeeklyReviewHash,
  shouldGenerateWeeklyAi,
  weeklyReviewContext,
} = require("./deepseek-weekly-review-service.cjs");

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function assertDate(value) {
  if (typeof value !== "string" || !datePattern.test(value)) throw new Error("Invalid date");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error("Invalid date");
  return value;
}

function shiftDate(value, days) {
  const parsed = new Date(`${assertDate(value)}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function normalizeInsightPreferences(settings) {
  if (!settings || typeof settings !== "object") return null;
  const dietaryPattern = settings.dietary_pattern ?? settings.dietaryPattern ?? null;
  const foodAvoidances = Array.isArray(settings.food_avoidances)
    ? settings.food_avoidances
    : Array.isArray(settings.foodAvoidances)
      ? settings.foodAvoidances
      : [];
  const mealsRaw = Number(settings.meals_per_day ?? settings.mealsPerDay);
  const mealsPerDay =
    Number.isFinite(mealsRaw) && mealsRaw >= 2 && mealsRaw <= 5 ? Math.round(mealsRaw) : 3;
  return {
    dietaryPattern,
    dietaryPatternLabel: dietaryPatternLabel(dietaryPattern),
    foodAvoidances: foodAvoidances.slice(0, 20),
    foodAvoidanceLabels: foodAvoidanceLabels(foodAvoidances).slice(0, 20),
    mealsPerDay,
  };
}

function dailyInsightContext(summary, preferences = null) {
  const meals = Array.isArray(summary?.meals) ? summary.meals : [];
  const mealTypes = [...new Set(meals.map((meal) => meal?.mealType).filter((value) => typeof value === "string"))].slice(0, 4);
  const mealNames = [...new Set(meals.map((meal) => typeof meal?.name === "string" ? meal.name.trim() : "").filter(Boolean))].slice(0, 6);
  const context = {
    daily: {
      targets: summary?.targets ?? {},
      consumed: summary?.consumed ?? {},
      remaining: summary?.remaining ?? {},
      excess: summary?.excess ?? {},
      progress: summary?.progress ?? {},
      completion: Number(summary?.completion ?? 0),
      mealCount: meals.length,
      mealTypes,
      mealNames,
    },
  };
  if (preferences) context.preferences = preferences;
  return context;
}

function cachedInsight(row, contextHash) {
  if (!row || row.context_hash !== contextHash || !row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) return null;
  // Legacy main-cloudbase text is invalid after the provider switch; regenerate it once.
  if (row.provider === "cloudbase") return null;
  const focus = typeof row.payload.focus === "string" ? row.payload.focus : "";
  const headline = typeof row.payload.headline === "string" ? row.payload.headline.trim() : "";
  const content = typeof row.payload.content === "string" ? row.payload.content.trim() : "";
  if (!focus || !headline || !content) return null;
  return { focus, headline, content, source: row.provider ?? "rule_v3", model: row.model ?? null, cached: true };
}

function serverMetadata(clock) {
  const now = clock();
  const serverTime = now.toISOString();
  return { serverTime, serverDate: dateKey(serverTime) };
}

function createInsightDataService({ db, listMealsRange, getNutritionPlan, generateDailyInsight, generateWeeklyReview, clock = () => new Date() }) {
  if (typeof listMealsRange !== "function" || typeof getNutritionPlan !== "function") {
    throw new Error("Insight dependencies are unavailable");
  }
  if (typeof clock !== "function") throw new Error("Insight clock is unavailable");
  const generate = typeof generateDailyInsight === "function" ? generateDailyInsight : createDailyInsightService();

  async function getDailySummary(userId, date, options = {}) {
    assertDate(date);
    const resolveImages = options.resolveImages !== false;
    let meals = [];
    let plan = null;
    try {
      meals = await listMealsRange(userId, date, date, { resolveImages });
    } catch (error) {
      error.code = error.code || "MEAL_SERVICE_UNAVAILABLE";
      throw error;
    }
    try {
      plan = await getNutritionPlan(userId);
    } catch (error) {
      console.warn("[daily-summary] nutrition plan read failed:", error?.message || error);
      plan = {};
    }
    return { date, ...serverMetadata(clock), ...calculateDailyNutrition(meals, plan), meals };
  }

  async function loadUserPreferences(userId) {
    if (!db || typeof db.from !== "function") return null;
    try {
      const lookup = await db
        .from("user_settings")
        .select("dietary_pattern,food_avoidances,meals_per_day")
        .eq("id", userId)
        .maybeSingle();
      if (lookup.error || !lookup.data) return null;
      return normalizeInsightPreferences(lookup.data);
    } catch {
      return null;
    }
  }

  function insightPayloadFromGenerated(generated) {
    const payload = {
      focus: String(generated?.focus ?? "regularity"),
      headline: String(generated?.headline ?? "今天保持规律进餐").trim().slice(0, 24),
      content: String(generated?.content ?? "根据今天的真实记录，下一餐继续保持蛋白质、蔬菜和主食的搭配。").trim().slice(0, 140),
    };
    if (!payload.headline || !payload.content) throw new Error("Daily insight generation failed");
    const provider = ["cloudbase", "deepseek", "hunyuan-exp"].includes(generated?.source) ? generated.source : "rule_v3";
    return { payload, provider, model: generated?.model ?? null };
  }

  async function persistDailyInsight(userId, date, contextHash, generated) {
    const { payload, provider, model } = insightPayloadFromGenerated(generated);
    if (db && typeof db.from === "function") {
      try {
        const persisted = await db.from("daily_nutrition_insights").upsert({
          user_id: userId,
          insight_date: date,
          context_hash: contextHash,
          payload,
          provider,
          model,
        }, { onConflict: "user_id,insight_date" });
        if (persisted.error) {
          console.warn("[daily-insight] cache write unavailable:", persisted.error.message || persisted.error);
          return { ...payload, source: provider, model, cached: false };
        }
      } catch (error) {
        console.warn("[daily-insight] cache write unavailable:", error?.message || error);
        return { ...payload, source: provider, model, cached: false };
      }
    }
    return { ...payload, source: provider, model, cached: false };
  }

  function scheduleDailyInsightUpgrade(userId, date, context, contextHash) {
    void (async () => {
      try {
        let generated;
        try {
          generated = await generate({ date, context, userId });
        } catch {
          return;
        }
        await persistDailyInsight(userId, date, contextHash, generated);
      } catch (error) {
        console.warn("[daily-insight] background generation failed:", error?.message || error);
      }
    })();
  }

  async function getDailyInsightForSummary(userId, date, summary, options = {}) {
    const preferFast = Boolean(options?.preferFast);
    const preferences = await loadUserPreferences(userId);
    const context = dailyInsightContext(summary, preferences);
    const contextHash = createDailyInsightHash(context);
    let cached = null;
    if (db && typeof db.from === "function") {
      try {
        const lookup = await db.from("daily_nutrition_insights").select("context_hash,payload,provider,model")
          .eq("user_id", userId).eq("insight_date", date).maybeSingle();
        if (lookup.error) {
          console.warn("[daily-insight] cache read unavailable:", lookup.error.message || lookup.error);
        } else {
          cached = cachedInsight(lookup.data, contextHash);
        }
      } catch (error) {
        console.warn("[daily-insight] cache read unavailable:", error?.message || error);
      }
    }
    if (cached) return cached;

    if (preferFast) {
      const rule = { ...createRuleInsight(context), source: "rule_v3", model: null };
      const result = await persistDailyInsight(userId, date, contextHash, rule);
      scheduleDailyInsightUpgrade(userId, date, context, contextHash);
      return result;
    }

    let generated;
    try {
      generated = await generate({ date, context, userId });
    } catch {
      generated = { ...createRuleInsight(context), source: "rule_v3", model: null };
    }
    return persistDailyInsight(userId, date, contextHash, generated);
  }

  async function getDailyInsight(userId, date, options = {}) {
    const summary = await getDailySummary(userId, date, { resolveImages: false });
    return getDailyInsightForSummary(userId, date, summary, options);
  }

  async function getDailySummaryWithInsight(userId, date, options = {}) {
    const summary = await getDailySummary(userId, date, { resolveImages: options.resolveImages !== false });
    return { ...summary, insight: await getDailyInsightForSummary(userId, date, summary, options) };
  }

  async function getWeeklyReview(userId, endDate, options = {}) {
    assertDate(endDate);
    const preferFast = Boolean(options?.preferFast);
    const startDate = shiftDate(endDate, -6);
    let meals = [];
    let plan = null;
    try {
      meals = await listMealsRange(userId, startDate, endDate, { resolveImages: false });
    } catch (error) {
      error.code = error.code || "MEAL_SERVICE_UNAVAILABLE";
      throw error;
    }
    try {
      plan = await getNutritionPlan(userId);
    } catch (error) {
      console.warn("[weekly-review] nutrition plan read failed:", error?.message || error);
      plan = null;
    }
    const review = calculateWeeklyNutrition(meals, plan, endDate);
    const baseReview = {
      ...review,
      ...serverMetadata(clock),
      calorieTarget: review.targets.calories,
    };
    const context = weeklyReviewContext(baseReview);
    const contextHash = createWeeklyReviewHash(context);
    let cached = null;
    if (db && typeof db.from === "function") {
      try {
        const lookup = await db.from("weekly_nutrition_reviews").select("context_hash,payload,provider,model")
          .eq("user_id", userId).eq("end_date", endDate).maybeSingle();
        if (!lookup.error && lookup.data?.context_hash === contextHash && lookup.data?.payload && typeof lookup.data.payload === "object") {
          cached = { ...lookup.data.payload, source: lookup.data.provider ?? "rule_v1", model: lookup.data.model ?? null, cached: true };
        }
      } catch (error) {
        console.warn("[weekly-review] cache read unavailable:", error?.message || error);
      }
    }
    if (cached) return { ...baseReview, insight: cached };

    // Profile / light reads: stats only — avoid LLM and avoid locking the week to a rule cache.
    if (preferFast) {
      const insight = createFallbackWeeklyReview(context);
      return {
        ...baseReview,
        insight: {
          headline: insight.headline,
          summary: insight.summary,
          strengths: insight.strengths,
          nextSteps: insight.nextSteps,
          source: insight.source,
          model: null,
          cached: false,
        },
      };
    }

    let insight = createFallbackWeeklyReview(context);
    if (shouldGenerateWeeklyAi(context) && typeof generateWeeklyReview === "function") {
      try { insight = await generateWeeklyReview({ date: endDate, context, userId }); } catch {}
    }
    const provider = insight?.source === "deepseek" ? "deepseek" : "rule_v1";
    const payload = {
      headline: String(insight?.headline || "本周节奏可继续稳定").trim().slice(0, 24),
      summary: String(insight?.summary || "继续根据真实记录调整下一周的饮食安排。").trim().slice(0, 180),
      strengths: Array.isArray(insight?.strengths) ? insight.strengths.slice(0, 2) : [],
      nextSteps: Array.isArray(insight?.nextSteps) ? insight.nextSteps.slice(0, 2) : [],
    };
    if (db && typeof db.from === "function") {
      try {
        const persisted = await db.from("weekly_nutrition_reviews").upsert({
          user_id: userId,
          start_date: startDate,
          end_date: endDate,
          context_hash: contextHash,
          payload,
          provider,
          model: insight?.model ?? null,
        }, { onConflict: "user_id,end_date" });
        if (persisted.error) throw new Error("Weekly review cache write failed");
      } catch (error) {
        console.warn("[weekly-review] cache write unavailable:", error?.message || error);
      }
    }
    return { ...baseReview, insight: { ...payload, source: provider, model: insight?.model ?? null, cached: false } };
  }

  async function getAchievements(userId, date) {
    assertDate(date);
    let meals = [];
    let plan = null;
    try {
      meals = await listMealsRange(userId, shiftDate(date, -29), date, { resolveImages: false });
    } catch (error) {
      error.code = error.code || "MEAL_SERVICE_UNAVAILABLE";
      throw error;
    }
    try {
      plan = await getNutritionPlan(userId);
    } catch (error) {
      console.warn("[achievements] nutrition plan read failed:", error?.message || error);
      plan = null;
    }
    return calculateAchievements(meals, plan, date);
  }

  return { getDailySummary, getDailySummaryWithInsight, getDailyInsight, getWeeklyReview, getAchievements };
}

module.exports = { createInsightDataService, dailyInsightContext };
