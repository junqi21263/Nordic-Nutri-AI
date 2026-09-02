import type { DailySummary, Meal, MealType } from "../meals/domain";

export type CoachMealContext = {
  summary: string;
  suggestion: string;
  ctaLabel: string;
  ctaAction: "record" | "progress";
  mealType: MealType | null;
};

type CreateCoachMealContextInput = {
  meals: Meal[];
  summary: DailySummary;
  hour: number;
};

const mainMealTypes: MealType[] = ["breakfast", "lunch", "dinner"];

function hasMealType(meals: Meal[], mealType: MealType) {
  return meals.some((meal) => meal.mealType === mealType);
}

function getAllMealsRecordedContext(summary: DailySummary): CoachMealContext {
  if (summary.consumed.protein < summary.protein * 0.8) {
    return {
      summary: "三餐已记录",
      suggestion: "今日行动：晚间可补一份优质蛋白，帮助完成目标。",
      ctaLabel: "查看今日进度",
      ctaAction: "progress",
      mealType: null,
    };
  }
  if (summary.consumed.calories < summary.calories * 0.75) {
    return {
      summary: "三餐已记录",
      suggestion: "今日行动：今日摄入偏少，可适当补足主食与蛋白。",
      ctaLabel: "查看今日进度",
      ctaAction: "progress",
      mealType: null,
    };
  }
  return {
    summary: "三餐已记录",
    suggestion: "今日行动：今天的营养节奏不错，继续保持。",
    ctaLabel: "查看今日进度",
    ctaAction: "progress",
    mealType: null,
  };
}

export function createCoachMealContext({ meals, summary, hour }: CreateCoachMealContextInput): CoachMealContext {
  const recorded = new Set(mainMealTypes.filter((mealType) => hasMealType(meals, mealType)));
  if (recorded.size === mainMealTypes.length) return getAllMealsRecordedContext(summary);

  if (recorded.has("lunch") && !recorded.has("breakfast")) {
    return {
      summary: "午餐已记录",
      suggestion: "今日行动：早餐可按需补记。",
      ctaLabel: "补记早餐",
      ctaAction: "record",
      mealType: "breakfast",
    };
  }
  if (recorded.has("breakfast") && !recorded.has("lunch")) {
    return {
      summary: "早餐已记录",
      suggestion: "今日行动：午餐还没记录，按自己的节奏补上。",
      ctaLabel: "记录午餐",
      ctaAction: "record",
      mealType: "lunch",
    };
  }
  if (recorded.has("breakfast") && recorded.has("lunch") && !recorded.has("dinner")) {
    return {
      summary: "已完成两餐记录",
      suggestion: "今日行动：晚餐还差一餐，继续完成今天节奏。",
      ctaLabel: "记录晚餐",
      ctaAction: "record",
      mealType: "dinner",
    };
  }

  if (meals.length > 0) {
    const nextMealType: MealType = hour >= 17 ? "dinner" : hour >= 11 ? "lunch" : "breakfast";
    return {
      summary: `今日已记录 ${meals.length} 餐`,
      suggestion: "今日行动：继续记录下一餐，让今天的营养进度更完整。",
      ctaLabel: "记录下一餐",
      ctaAction: "record",
      mealType: nextMealType,
    };
  }

  const nextMealType: MealType = hour >= 17 ? "dinner" : hour >= 11 ? "lunch" : "breakfast";
  return {
    summary: "今天还没有餐次记录",
    suggestion: "今日行动：今天先完成第一餐记录。",
    ctaLabel: "记录第一餐",
    ctaAction: "record",
    mealType: nextMealType,
  };
}
