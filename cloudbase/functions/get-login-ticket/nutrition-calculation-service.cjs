const nutrientKeys = ["calories", "protein", "carbs", "fat"];
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const vegetablePattern = /菜|菠菜|西兰花|芦笋|番茄|西红柿|黄瓜|生菜|白菜|青菜|胡萝卜|蘑菇|菌菇|甜椒|彩椒|玉米|土豆|南瓜|茄子|洋葱|海带|紫菜|芹菜|西葫芦/;

const achievementDefinitions = [
  { title: "第一餐记录", target: 1, metric: (data) => data.meals.length, available: true, requirement: "成功记录任意 1 餐到云端。", unit: "餐", unlockAt: (data) => unlockAtNthMeal(data.meals, 1) },
  { title: "早餐节奏", target: 3, metric: (data) => data.mealDaysByType.breakfast.size, available: true, requirement: "在 3 个不同日期记录早餐。", unit: "天", unlockAt: (data) => unlockAtNthDate(data.mealDaysByType.breakfast, 3) },
  { title: "午餐专注", target: 3, metric: (data) => data.mealDaysByType.lunch.size, available: true, requirement: "在 3 个不同日期记录午餐。", unit: "天", unlockAt: (data) => unlockAtNthDate(data.mealDaysByType.lunch, 3) },
  { title: "晚餐平衡", target: 3, metric: (data) => data.mealDaysByType.dinner.size, available: true, requirement: "在 3 个不同日期记录晚餐。", unit: "天", unlockAt: (data) => unlockAtNthDate(data.mealDaysByType.dinner, 3) },
  { title: "加餐有度", target: 3, metric: (data) => data.mealDaysByType.snack.size, available: true, requirement: "在 3 个不同日期记录加餐。", unit: "天", unlockAt: (data) => unlockAtNthDate(data.mealDaysByType.snack, 3) },
  { title: "蛋白达人", target: 3, metric: (data) => data.proteinDays, available: true, requirement: "有 3 天蛋白质完成度达到 90% 及以上。", unit: "天", unlockAt: (data) => unlockAtNthDate(data.proteinDayDates, 3) },
  { title: "连续七天", target: 7, metric: (data) => data.longestStreak, available: true, requirement: "连续 7 天都有饮食记录。", unit: "天", unlockAt: (data) => unlockAtStreakEnd(data.recordedDates, data.endDate, 7) },
  { title: "连续十四天", target: 14, metric: (data) => data.longestStreak, available: true, requirement: "连续 14 天都有饮食记录。", unit: "天", unlockAt: (data) => unlockAtStreakEnd(data.recordedDates, data.endDate, 14) },
  { title: "累计三十餐", target: 30, metric: (data) => data.meals.length, available: true, requirement: "累计记录 30 餐。", unit: "餐", unlockAt: (data) => unlockAtNthMeal(data.meals, 30) },
  { title: "累计五十餐", target: 50, metric: (data) => data.meals.length, available: true, requirement: "累计记录 50 餐。", unit: "餐", unlockAt: (data) => unlockAtNthMeal(data.meals, 50) },
  { title: "累计一百餐", target: 100, metric: (data) => data.meals.length, available: true, requirement: "累计记录 100 餐。", unit: "餐", unlockAt: (data) => unlockAtNthMeal(data.meals, 100) },
  { title: "水分自律", target: 1, metric: () => 0, available: false, requirement: "即将上线：完成每日饮水目标。", unit: "次", unlockAt: () => null },
  { title: "睡眠优先", target: 1, metric: () => 0, available: false, requirement: "即将上线：连续记录优质睡眠。", unit: "次", unlockAt: () => null },
  { title: "训练伙伴", target: 1, metric: () => 0, available: false, requirement: "即将上线：完成一次训练打卡。", unit: "次", unlockAt: () => null },
  { title: "恢复达人", target: 1, metric: () => 0, available: false, requirement: "即将上线：完成恢复日节奏。", unit: "次", unlockAt: () => null },
  { title: "蔬菜优先", target: 3, metric: (data) => data.vegetableDays, available: true, requirement: "有 3 天的餐食包含蔬菜。", unit: "天", unlockAt: (data) => unlockAtNthDate(data.vegetableDates, 3) },
  { title: "碳水平衡", target: 3, metric: (data) => data.carbBalanceDays, available: true, requirement: "有 3 天碳水完成度在 60%–120%，且蛋白质不少于 60%。", unit: "天", unlockAt: (data) => unlockAtNthDate(data.carbBalanceDates, 3) },
  { title: "低脂选择", target: 3, metric: (data) => data.lowFatDays, available: true, requirement: "有 3 天脂肪未超标，且蛋白质完成度不少于 60%。", unit: "天", unlockAt: (data) => unlockAtNthDate(data.lowFatDates, 3) },
  { title: "收藏灵感", target: 1, metric: (data) => data.favoriteMeals, available: true, requirement: "收藏任意 1 餐作为灵感。", unit: "餐", unlockAt: (data) => unlockAtNthMeal(data.favoriteMealRows, 1) },
  { title: "连续达标", target: 3, metric: (data) => data.qualifiedDaysStreak, available: true, requirement: "连续 3 天营养完成度达到 80% 及以上。", unit: "天", unlockAt: (data) => unlockAtStreakEnd(data.qualifiedDates, data.endDate, 3) },
];

function unlockAtNthMeal(meals, target) {
  const sorted = [...(meals || [])]
    .filter((meal) => meal?.recordedAt)
    .sort((left, right) => String(left.recordedAt).localeCompare(String(right.recordedAt)));
  return sorted[target - 1]?.recordedAt ?? null;
}

function unlockAtNthDate(dates, target) {
  const sorted = [...(dates || [])].filter(Boolean).sort();
  const date = sorted[target - 1];
  return date ? `${date}T12:00:00+08:00` : null;
}

function unlockAtStreakEnd(dates, endDate, target) {
  const available = new Set(dates || []);
  let current = 0;
  for (let offset = 29; offset >= 0; offset -= 1) {
    const date = shiftDate(endDate, -offset);
    if (available.has(date)) {
      current += 1;
      if (current >= target) return `${date}T12:00:00+08:00`;
    } else {
      current = 0;
    }
  }
  return null;
}

function finitePositive(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function finiteNonNegative(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

function round1(value) {
  return Math.round(finiteNonNegative(value) * 10) / 10;
}

function roundPercent(value) {
  return Math.min(100, Math.max(0, Math.round(finiteNonNegative(value))));
}

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
  return new Date(parsed.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function normalizeTargets(plan = {}) {
  return {
    calories: finitePositive(plan.calories ?? plan.caloriesKcal, 2600),
    protein: finitePositive(plan.protein ?? plan.proteinG, 180),
    carbs: finitePositive(plan.carbs ?? plan.carbsG, 300),
    fat: finitePositive(plan.fat ?? plan.fatG, 70),
  };
}

function nutritionFromMeal(meal = {}) {
  return {
    calories: finiteNonNegative(meal.calories ?? meal.caloriesKcal),
    protein: finiteNonNegative(meal.protein ?? meal.proteinG),
    carbs: finiteNonNegative(meal.carbs ?? meal.carbsG),
    fat: finiteNonNegative(meal.fat ?? meal.fatG),
  };
}

function mealContainsVegetable(meal = {}) {
  const names = [meal.title, meal.name, ...(Array.isArray(meal.items) ? meal.items.map((item) => item?.name) : [])]
    .filter((value) => typeof value === "string")
    .join(" ");
  return vegetablePattern.test(names);
}

function sumNutrition(meals) {
  return meals.reduce((total, meal) => {
    const nutrition = nutritionFromMeal(meal);
    return Object.fromEntries(nutrientKeys.map((key) => [key, total[key] + nutrition[key]]));
  }, Object.fromEntries(nutrientKeys.map((key) => [key, 0])));
}

function progressFor(consumed, target) {
  const safeConsumed = round1(consumed);
  const safeTarget = finitePositive(target, 0);
  const delta = safeTarget - safeConsumed;
  return {
    consumed: safeConsumed,
    target: round1(safeTarget),
    percent: safeTarget ? roundPercent((safeConsumed / safeTarget) * 100) : 0,
    remaining: round1(Math.max(0, delta)),
    excess: round1(Math.max(0, -delta)),
  };
}

function progressMap(consumed, targets) {
  return Object.fromEntries(nutrientKeys.map((key) => [key, progressFor(consumed[key], targets[key])]));
}

function weightedCompletion(progress) {
  return Math.round(
    progress.calories.percent * 0.4
    + progress.protein.percent * 0.3
    + progress.carbs.percent * 0.2
    + progress.fat.percent * 0.1,
  );
}

function calculateDailyNutrition(meals = [], plan = {}) {
  const targets = normalizeTargets(plan);
  const consumed = Object.fromEntries(Object.entries(sumNutrition(Array.isArray(meals) ? meals : [])).map(([key, value]) => [key, round1(value)]));
  const progress = progressMap(consumed, targets);
  return {
    targets,
    consumed,
    remaining: Object.fromEntries(nutrientKeys.map((key) => [key, progress[key].remaining])),
    excess: Object.fromEntries(nutrientKeys.map((key) => [key, progress[key].excess])),
    progress,
    completion: weightedCompletion(progress),
  };
}

function calculateWeeklyNutrition(meals = [], plan = {}, endDate) {
  const safeEndDate = assertDate(endDate);
  const startDate = shiftDate(safeEndDate, -6);
  const safeMeals = (Array.isArray(meals) ? meals : []).filter((meal) => {
    const date = dateKey(meal.recordedAt);
    return date >= startDate && date <= safeEndDate;
  });
  const dailyTargets = normalizeTargets(plan);
  const weeklyTargets = Object.fromEntries(nutrientKeys.map((key) => [key, dailyTargets[key] * 7]));
  const consumed = Object.fromEntries(Object.entries(sumNutrition(safeMeals)).map(([key, value]) => [key, round1(value)]));
  const progress = progressMap(consumed, weeklyTargets);
  const dates = Array.from({ length: 7 }, (_, index) => shiftDate(startDate, index));
  const daily = dates.map((date) => {
    const dayMeals = safeMeals.filter((meal) => dateKey(meal.recordedAt) === date);
    const summary = calculateDailyNutrition(dayMeals, dailyTargets);
    return { date, recorded: dayMeals.length > 0, completion: summary.completion, progress: summary.progress };
  });
  const recordedDays = daily.filter((day) => day.recorded).length;
  const consistency = roundPercent((recordedDays / 7) * 100);
  const nutritionCompletion = weightedCompletion(progress);
  return {
    startDate,
    endDate: safeEndDate,
    targets: dailyTargets,
    weeklyTargets,
    consumed,
    progress,
    consistency,
    nutritionCompletion,
    score: Math.round(consistency * 0.35 + nutritionCompletion * 0.65),
    recordedMeals: safeMeals.length,
    recordedDays,
    calorieCompletion: progress.calories.percent,
    proteinCompletion: progress.protein.percent,
    carbsCompletion: progress.carbs.percent,
    fatCompletion: progress.fat.percent,
    rhythm: daily.map(({ date, recorded, completion }) => ({ date, recorded, completion })),
  };
}

function dayStats(meals, targets, endDate) {
  const startDate = shiftDate(endDate, -29);
  const safeMeals = meals.filter((meal) => {
    const date = dateKey(meal.recordedAt);
    return date >= startDate && date <= endDate;
  });
  const days = new Map();
  for (const meal of safeMeals) {
    const date = dateKey(meal.recordedAt);
    if (!date) continue;
    const current = days.get(date) ?? { meals: [], types: new Set() };
    current.meals.push(meal);
    current.types.add(meal.mealType);
    days.set(date, current);
  }
  const dailySummaries = [...days.entries()].map(([date, data]) => [date, calculateDailyNutrition(data.meals, targets)]);
  return { safeMeals, days, dailySummaries };
}

function longestStreak(dates, endDate) {
  const available = new Set(dates);
  let best = 0;
  let current = 0;
  for (let offset = 29; offset >= 0; offset -= 1) {
    const date = shiftDate(endDate, -offset);
    if (available.has(date)) current += 1;
    else current = 0;
    best = Math.max(best, current);
  }
  return best;
}

function calculateAchievements(meals = [], plan = {}, endDate) {
  const safeEndDate = assertDate(endDate);
  const targets = normalizeTargets(plan);
  const stats = dayStats(Array.isArray(meals) ? meals : [], targets, safeEndDate);
  const mealDaysByType = Object.fromEntries(["breakfast", "lunch", "dinner", "snack"].map((type) => [
    type,
    new Set(stats.safeMeals.filter((meal) => meal.mealType === type).map((meal) => dateKey(meal.recordedAt))),
  ]));
  const proteinDayDates = stats.dailySummaries
    .filter(([, summary]) => summary.progress.protein.percent >= 90)
    .map(([date]) => date)
    .sort();
  const vegetableDates = new Set(stats.safeMeals.filter(mealContainsVegetable).map((meal) => dateKey(meal.recordedAt)));
  const carbBalanceDates = stats.dailySummaries
    .filter(([, summary]) => summary.progress.carbs.percent >= 60 && summary.progress.carbs.percent <= 120 && summary.progress.protein.percent >= 60)
    .map(([date]) => date)
    .sort();
  const lowFatDates = stats.dailySummaries
    .filter(([, summary]) => summary.progress.fat.percent <= 100 && summary.progress.protein.percent >= 60)
    .map(([date]) => date)
    .sort();
  const qualifiedDates = stats.dailySummaries.filter(([, summary]) => summary.completion >= 80).map(([date]) => date);
  const recordedDates = [...stats.days.keys()];
  const favoriteMealRows = stats.safeMeals.filter((meal) => Boolean(meal.isFavorite));
  const data = {
    meals: stats.safeMeals,
    mealDaysByType,
    proteinDays: proteinDayDates.length,
    proteinDayDates,
    longestStreak: longestStreak(recordedDates, safeEndDate),
    vegetableDays: vegetableDates.size,
    vegetableDates,
    carbBalanceDays: carbBalanceDates.length,
    carbBalanceDates,
    lowFatDays: lowFatDates.length,
    lowFatDates,
    favoriteMeals: favoriteMealRows.length,
    favoriteMealRows,
    qualifiedDaysStreak: longestStreak(qualifiedDates, safeEndDate),
    qualifiedDates,
    recordedDates,
    endDate: safeEndDate,
  };
  return achievementDefinitions.map((definition, index) => {
    const metric = Math.max(0, Number(definition.metric(data)) || 0);
    const progress = definition.available ? Math.min(100, Math.round((metric / definition.target) * 100)) : 0;
    const unlocked = definition.available && metric >= definition.target;
    return {
      id: `achievement-${index}`,
      title: definition.title,
      available: definition.available,
      unlocked,
      progress,
      metric,
      target: definition.target,
      unit: definition.unit || "",
      requirement: definition.requirement || "",
      unlockedAt: unlocked ? (definition.unlockAt?.(data) || null) : null,
    };
  });
}

module.exports = {
  calculateAchievements,
  calculateDailyNutrition,
  calculateWeeklyNutrition,
  dateKey,
  normalizeTargets,
};
