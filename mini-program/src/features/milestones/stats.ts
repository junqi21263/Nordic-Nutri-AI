import type { DailyTargets, Meal } from "../meals/domain";

export const MILESTONES = [3, 7, 14, 30] as const;
export type Milestone = (typeof MILESTONES)[number];

export interface MilestoneStats {
  milestone: Milestone;
  mealsLogged: number;
  recordedDays: number;
  recordingConsistency?: number;
  targetCompletionRate?: number;
  avgProtein?: number;
  avgCarbs?: number;
  avgFat?: number;
  mostLoggedFood?: string;
  mostLoggedFoodCount?: number;
  vsPreviousPeriod?: number;
  targetDays?: number;
}

export interface MilestoneHighlight {
  key: "mealsLogged" | "targetCompletionRate" | "recordingConsistency" | "avgProtein" | "avgCarbs" | "avgFat" | "mostLoggedFood" | "vsPreviousPeriod" | "targetDays";
  label: string;
  value: string;
}

function round(value: number) {
  return Math.round(value);
}

function normaliseFoodName(name: string) {
  return name
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/\b\d+(?:\.\d+)?\s*(?:g|克|ml|毫升)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function hasFinitePositive(value: number | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function mealNutrition(meal: Meal) {
  return meal.items.reduce(
    (total, item) => ({
      calories: total.calories + item.calories,
      protein: total.protein + item.protein,
      carbs: total.carbs + item.carbs,
      fat: total.fat + item.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
}

export function calculateMilestoneStats({
  milestone,
  meals,
  dailyTargets,
  previousMeals = [],
}: {
  milestone: Milestone;
  meals: Meal[];
  dailyTargets: DailyTargets;
  previousMeals?: Meal[];
}): MilestoneStats {
  const mealsByDay = new Map<string, Meal[]>();
  meals.forEach((entry) => {
    const dayMeals = mealsByDay.get(entry.date) ?? [];
    dayMeals.push(entry);
    mealsByDay.set(entry.date, dayMeals);
  });
  const recordedDays = mealsByDay.size;
  const totals = [...mealsByDay.values()].reduce(
    (total, dayMeals) => {
      const day = dayMeals.reduce(
        (dayTotal, entry) => {
          const nutrition = mealNutrition(entry);
          return {
            calories: dayTotal.calories + nutrition.calories,
            protein: dayTotal.protein + nutrition.protein,
            carbs: dayTotal.carbs + nutrition.carbs,
            fat: dayTotal.fat + nutrition.fat,
          };
        },
        { calories: 0, protein: 0, carbs: 0, fat: 0 },
      );
      return {
        calories: total.calories + day.calories,
        protein: total.protein + day.protein,
        carbs: total.carbs + day.carbs,
        fat: total.fat + day.fat,
        completion: total.completion + (dailyTargets.calories > 0 ? Math.min(100, round((day.calories / dailyTargets.calories) * 100)) : 0),
      };
    },
    { calories: 0, protein: 0, carbs: 0, fat: 0, completion: 0 },
  );
  const foods = new Map<string, { name: string; count: number }>();
  meals.forEach((entry) => entry.items.forEach((item) => {
    const name = normaliseFoodName(item.name);
    if (!name) return;
    const key = item.foodId ? `id:${item.foodId}` : `name:${name.toLocaleLowerCase()}`;
    const current = foods.get(key) ?? { name, count: 0 };
    foods.set(key, { name: current.name, count: current.count + 1 });
  }));
  const mostLogged = [...foods.values()].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name, "zh-CN"))[0];
  const previousDays = new Set(previousMeals.map((entry) => entry.date)).size;

  return {
    milestone,
    mealsLogged: meals.length,
    recordedDays,
    recordingConsistency: recordedDays ? Math.min(100, round((recordedDays / milestone) * 100)) : undefined,
    targetCompletionRate: recordedDays ? round(totals.completion / recordedDays) : undefined,
    avgProtein: recordedDays ? round(totals.protein / recordedDays) : undefined,
    avgCarbs: recordedDays ? round(totals.carbs / recordedDays) : undefined,
    avgFat: recordedDays ? round(totals.fat / recordedDays) : undefined,
    mostLoggedFood: mostLogged?.name,
    mostLoggedFoodCount: mostLogged?.count,
    vsPreviousPeriod: previousDays ? round(((recordedDays - previousDays) / previousDays) * 100) : undefined,
    targetDays: recordedDays,
  };
}

const highlightDefinitions: Record<MilestoneHighlight["key"], (stats: Partial<MilestoneStats>) => MilestoneHighlight | null> = {
  mealsLogged: (stats) => hasFinitePositive(stats.mealsLogged) ? { key: "mealsLogged", label: "记录餐数", value: `${stats.mealsLogged}` } : null,
  targetCompletionRate: (stats) => hasFinitePositive(stats.targetCompletionRate) ? { key: "targetCompletionRate", label: "目标达成", value: `${stats.targetCompletionRate}%` } : null,
  recordingConsistency: (stats) => hasFinitePositive(stats.recordingConsistency) ? { key: "recordingConsistency", label: "记录节奏", value: `${stats.recordingConsistency}%` } : null,
  avgProtein: (stats) => hasFinitePositive(stats.avgProtein) ? { key: "avgProtein", label: "平均蛋白质", value: `${stats.avgProtein}g` } : null,
  avgCarbs: (stats) => hasFinitePositive(stats.avgCarbs) ? { key: "avgCarbs", label: "平均碳水", value: `${stats.avgCarbs}g` } : null,
  avgFat: (stats) => hasFinitePositive(stats.avgFat) ? { key: "avgFat", label: "平均脂肪", value: `${stats.avgFat}g` } : null,
  mostLoggedFood: (stats) => stats.mostLoggedFood && hasFinitePositive(stats.mostLoggedFoodCount) ? { key: "mostLoggedFood", label: "常记录食物", value: stats.mostLoggedFood } : null,
  vsPreviousPeriod: (stats) => typeof stats.vsPreviousPeriod === "number" && Number.isFinite(stats.vsPreviousPeriod) ? { key: "vsPreviousPeriod", label: "较上期", value: `${stats.vsPreviousPeriod >= 0 ? "+" : ""}${stats.vsPreviousPeriod}%` } : null,
  targetDays: (stats) => hasFinitePositive(stats.targetDays) ? { key: "targetDays", label: "达标天数", value: `${stats.targetDays} 天` } : null,
};

const priorities: Record<Milestone, MilestoneHighlight["key"][]> = {
  3: ["mealsLogged", "recordingConsistency", "targetCompletionRate"],
  7: ["targetCompletionRate", "mealsLogged", "avgProtein", "recordingConsistency"],
  14: ["avgProtein", "avgCarbs", "avgFat", "mostLoggedFood", "mealsLogged"],
  30: ["targetDays", "targetCompletionRate", "vsPreviousPeriod", "mostLoggedFood", "recordingConsistency", "mealsLogged"],
};

export function selectMilestoneHighlights(stats: Partial<MilestoneStats> & { milestone: Milestone }) {
  const limit = stats.milestone <= 7 ? 2 : 3;
  return priorities[stats.milestone]
    .map((key) => highlightDefinitions[key](stats))
    .filter((item): item is MilestoneHighlight => item !== null)
    .slice(0, limit);
}
