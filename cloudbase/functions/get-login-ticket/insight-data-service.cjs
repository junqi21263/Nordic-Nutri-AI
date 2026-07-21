const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const achievementNames = [
  "第一餐记录", "早餐节奏", "午餐专注", "晚餐平衡", "加餐有度",
  "蛋白达人", "连续七天", "连续十四天", "累计三十餐", "累计五十餐",
  "累计一百餐", "水分自律", "睡眠优先", "训练伙伴", "恢复达人",
  "蔬菜优先", "碳水平衡", "低脂选择", "收藏灵感", "连续达标",
];

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

function dateKey(value) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return new Date(parsed.getTime() + (8 * 60 * 60 * 1000)).toISOString().slice(0, 10);
}

function totalsFor(meals) {
  return meals.reduce((totals, meal) => ({
    calories: totals.calories + Number(meal.caloriesKcal ?? 0),
    protein: totals.protein + Number(meal.proteinG ?? 0),
    carbs: totals.carbs + Number(meal.carbsG ?? 0),
    fat: totals.fat + Number(meal.fatG ?? 0),
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
}

function rounded(values) {
  return Object.fromEntries(Object.entries(values).map(([key, value]) => [key, Math.round(Number(value) * 10) / 10]));
}

function targetsFor(plan) {
  return {
    calories: Number(plan?.calories ?? 2600),
    protein: Number(plan?.proteinG ?? 180),
    carbs: Number(plan?.carbsG ?? 300),
    fat: Number(plan?.fatG ?? 70),
  };
}

function createInsightDataService({ listMealsRange, getNutritionPlan }) {
  if (typeof listMealsRange !== "function" || typeof getNutritionPlan !== "function") {
    throw new Error("Insight dependencies are unavailable");
  }

  async function getDailySummary(userId, date) {
    assertDate(date);
    const [meals, plan] = await Promise.all([
      listMealsRange(userId, date, date),
      getNutritionPlan(userId),
    ]);
    const targets = targetsFor(plan);
    const consumed = rounded(totalsFor(meals));
    const remaining = rounded(Object.fromEntries(Object.keys(targets).map((key) => [key, Math.max(0, targets[key] - consumed[key])])));
    return {
      date,
      targets,
      consumed,
      remaining,
      completion: targets.calories > 0 ? Math.min(100, Math.round((consumed.calories / targets.calories) * 100)) : 0,
      meals,
    };
  }

  async function getWeeklyReview(userId, endDate) {
    assertDate(endDate);
    const startDate = shiftDate(endDate, -6);
    const [meals, plan] = await Promise.all([
      listMealsRange(userId, startDate, endDate),
      getNutritionPlan(userId),
    ]);
    const targets = targetsFor(plan);
    const consumed = rounded(totalsFor(meals));
    const rhythm = Array.from({ length: 7 }, (_, index) => {
      const date = shiftDate(startDate, index);
      return { date, recorded: meals.some((meal) => dateKey(meal.recordedAt) === date) };
    });
    const recordedDays = rhythm.filter((day) => day.recorded).length;
    const proteinTarget = targets.protein * Math.max(1, recordedDays);
    const proteinCompletion = proteinTarget > 0 ? Math.min(100, Math.round((consumed.protein / proteinTarget) * 100)) : 0;
    const consistency = Math.round((recordedDays / 7) * 100);
    const score = Math.round((consistency + proteinCompletion + Math.min(100, meals.length * 15)) / 3);
    return {
      startDate,
      endDate,
      score,
      recordedMeals: meals.length,
      recordedDays,
      proteinCompletion,
      calorieTarget: targets.calories,
      consumed,
      rhythm,
    };
  }

  async function getAchievements(userId, date) {
    assertDate(date);
    const meals = await listMealsRange(userId, shiftDate(date, -29), date);
    return achievementNames.map((title, index) => ({
      id: `achievement-${index}`,
      title,
      unlocked: index < 3 || meals.length >= index + 1,
      progress: Math.min(100, Math.round((meals.length / (index + 1)) * 100)),
    }));
  }

  return { getDailySummary, getWeeklyReview, getAchievements };
}

module.exports = { createInsightDataService };
