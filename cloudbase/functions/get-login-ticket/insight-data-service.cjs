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
  naturalWeekStartDate,
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

const milestoneValues = new Set([3, 7, 14, 30]);

function normalizeFoodName(value) {
  return String(value || "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/\b\d+(?:\.\d+)?\s*(?:g|克|ml|毫升)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function milestoneMessage({ milestone, mealsLogged, recordedDays, mostLoggedFood }) {
  const message = !recordedDays
    ? "从记录第一餐开始，慢慢建立属于你的饮食节奏。"
    : mostLoggedFood
      ? `最近 ${milestone} 天记录了 ${mealsLogged} 餐，${mostLoggedFood}陪你稳住饮食节奏。`
      : `最近 ${milestone} 天记录了 ${mealsLogged} 餐，持续记录会让建议更贴近你。`;
  return message.slice(0, 40);
}

function stableMilestoneIllustrationVariant(userId, milestone, endDate, variantCount) {
  const source = `${userId}:${milestone}:${endDate}`;
  let hash = 0;
  for (let index = 0; index < source.length; index += 1) {
    hash = ((hash * 31) + source.charCodeAt(index)) >>> 0;
  }
  return hash % variantCount;
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

function createInsightDataService({ db, listMealsRange, countMeals, getNutritionPlan, getProfileCompletion, achievementState, generateDailyInsight, generateWeeklyReview, weeklyReviewModel = null, clock = () => new Date() }) {
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
    const provider = typeof generated?.source === "string" && generated.source.trim() ? generated.source.trim() : "rule_v3";
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
    const startDate = naturalWeekStartDate(endDate);
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
        const cachedModelMatches = !weeklyReviewModel || lookup.data?.model === weeklyReviewModel;
        if (!lookup.error && cachedModelMatches && lookup.data?.context_hash === contextHash && lookup.data?.payload && typeof lookup.data.payload === "object") {
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
    const provider = typeof insight?.source === "string" && insight.source.trim() ? insight.source.trim() : "rule_v1";
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

  async function getMilestoneStats(userId, milestone, endDate) {
    assertDate(endDate);
    const safeMilestone = Number(milestone);
    if (!milestoneValues.has(safeMilestone)) {
      const error = new Error("里程碑参数无效");
      error.code = "INSIGHT_DATA_INVALID";
      throw error;
    }
    const startDate = shiftDate(endDate, -(safeMilestone - 1));
    const previousEndDate = shiftDate(startDate, -1);
    const previousStartDate = shiftDate(previousEndDate, -(safeMilestone - 1));
    const [meals, previousMeals, plan] = await Promise.all([
      listMealsRange(userId, startDate, endDate, { resolveImages: false }),
      listMealsRange(userId, previousStartDate, previousEndDate, { resolveImages: false }),
      getNutritionPlan(userId),
    ]);
    const targetCalories = Number(plan?.calories ?? plan?.caloriesKcal ?? 0);
    const days = new Map();
    const foods = new Map();
    for (const meal of meals) {
      const date = dateKey(meal?.recordedAt);
      if (!date) continue;
      const current = days.get(date) ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
      current.calories += Number(meal?.calories ?? meal?.caloriesKcal ?? 0) || 0;
      current.protein += Number(meal?.protein ?? meal?.proteinG ?? 0) || 0;
      current.carbs += Number(meal?.carbs ?? meal?.carbsG ?? 0) || 0;
      current.fat += Number(meal?.fat ?? meal?.fatG ?? 0) || 0;
      days.set(date, current);
      for (const item of Array.isArray(meal?.items) ? meal.items : []) {
        const name = normalizeFoodName(item?.name);
        if (!name) continue;
        const key = item?.foodId ? `id:${item.foodId}` : `name:${name.toLocaleLowerCase()}`;
        const food = foods.get(key) ?? { name, count: 0 };
        foods.set(key, { name: food.name, count: food.count + 1 });
      }
    }
    const recordedDays = days.size;
    const totals = [...days.values()].reduce((total, day) => ({
      protein: total.protein + day.protein,
      carbs: total.carbs + day.carbs,
      fat: total.fat + day.fat,
      completion: total.completion + (targetCalories > 0 ? Math.min(100, Math.round((day.calories / targetCalories) * 100)) : 0),
      targetDays: total.targetDays + (targetCalories > 0 && day.calories / targetCalories >= 0.8 ? 1 : 0),
    }), { protein: 0, carbs: 0, fat: 0, completion: 0, targetDays: 0 });
    const mostLogged = [...foods.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "zh-CN"))[0];
    const previousLogged = Array.isArray(previousMeals) ? previousMeals.length : 0;
    const stats = {
      milestone: safeMilestone,
      mealsLogged: meals.length,
      recordedDays,
      recordingConsistency: recordedDays ? Math.min(100, Math.round((recordedDays / safeMilestone) * 100)) : undefined,
      targetCompletionRate: recordedDays && targetCalories > 0 ? Math.round(totals.completion / recordedDays) : undefined,
      avgProtein: recordedDays ? Math.round(totals.protein / recordedDays) : undefined,
      avgCarbs: recordedDays ? Math.round(totals.carbs / recordedDays) : undefined,
      avgFat: recordedDays ? Math.round(totals.fat / recordedDays) : undefined,
      mostLoggedFood: mostLogged?.name,
      mostLoggedFoodCount: mostLogged?.count,
      vsPreviousPeriod: previousLogged ? Math.round(((meals.length - previousLogged) / previousLogged) * 100) : undefined,
      targetDays: totals.targetDays || undefined,
    };
    const illustrationVariant = stableMilestoneIllustrationVariant(
      userId,
      safeMilestone,
      endDate,
      safeMilestone === 3 || safeMilestone === 7 ? 3 : 2,
    );
    return { ...stats, illustrationVariant, personalizedMessage: milestoneMessage(stats), ...serverMetadata(clock) };
  }

  async function getAchievements(userId, date) {
    assertDate(date);
    let meals = [];
    let plan = null;
    let lifetimeMealCount = meals.length;
    let profileCompletion = null;
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
    if (typeof countMeals === "function") {
      try {
        lifetimeMealCount = await countMeals(userId);
      } catch (error) {
        console.warn("[achievements] lifetime meal count read failed:", error?.message || error);
      }
    }
    if (typeof getProfileCompletion === "function") {
      try {
        profileCompletion = await getProfileCompletion(userId);
      } catch (error) {
        console.warn("[achievements] profile completion read failed:", error?.message || error);
      }
    }
    const calculated = calculateAchievements(meals, plan, date, {
      lifetimeMealCount,
      profileComplete: profileCompletion?.completed === true,
      profileCompletedAt: profileCompletion?.completedAt ?? null,
    });
    return achievementState ? achievementState.reconcile(userId, calculated) : calculated;
  }

  async function acknowledgeAchievementCelebration(userId, achievementId) {
    if (!achievementState?.acknowledgeCelebration) throw new Error("Achievement celebration state is unavailable");
    return achievementState.acknowledgeCelebration(userId, achievementId);
  }

  return {
    getDailySummary,
    getDailySummaryWithInsight,
    getDailyInsight,
    getWeeklyReview,
    getMilestoneStats,
    getAchievements,
    acknowledgeAchievementCelebration,
  };
}

module.exports = { createInsightDataService, dailyInsightContext };
