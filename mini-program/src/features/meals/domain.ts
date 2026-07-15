export type MealType = "breakfast" | "lunch" | "dinner" | "snack";
export type MealLoadingState = "loading" | "empty" | "normal" | "error";

export interface MealItem {
  id: string;
  name: string;
  amount: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface Meal {
  id: string;
  date: string;
  time: string;
  title: string;
  mealType: MealType;
  favorite: boolean;
  imageKey: "bowl" | "salmon" | "oats" | null;
  items: MealItem[];
  insight: string;
}

export interface DailyTargets {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
}

export interface DailySummary extends DailyTargets {
  consumed: DailyTargets;
  completion: number;
}

export const localDailyTargets: DailyTargets = {
  calories: 2600,
  protein: 180,
  carbs: 300,
  fat: 70,
};

export function shiftDate(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  const localDate = new Date(year, month - 1, day);
  localDate.setDate(localDate.getDate() + days);
  return `${localDate.getFullYear()}-${String(localDate.getMonth() + 1).padStart(2, "0")}-${String(localDate.getDate()).padStart(2, "0")}`;
}

export function getMealNutrition(meal: Meal): DailyTargets {
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

export function clampProgress(value: number, target: number) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const safeTarget = Number.isFinite(target) && target > 0 ? target : 0;
  const remaining = safeTarget ? safeTarget - safeValue : 0;
  return {
    percent: safeTarget
      ? Math.min(100, Math.max(0, Math.round((safeValue / safeTarget) * 100)))
      : 0,
    remaining,
    exceeded: safeTarget > 0 && safeValue > safeTarget,
  };
}

export function getDailySummary(
  meals: Meal[],
  date: string,
  targets = localDailyTargets,
): DailySummary {
  const consumed = meals
    .filter((meal) => meal.date === date)
    .map(getMealNutrition)
    .reduce(
      (total, nutrition) => ({
        calories: total.calories + nutrition.calories,
        protein: total.protein + nutrition.protein,
        carbs: total.carbs + nutrition.carbs,
        fat: total.fat + nutrition.fat,
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );
  return {
    ...targets,
    consumed,
    completion: clampProgress(consumed.calories, targets.calories).percent,
  };
}

export function getMealScore(meal: Meal): "A" | "B" | "C" {
  const nutrition = getMealNutrition(meal);
  if (nutrition.protein >= 30 && nutrition.fat <= 25) return "A";
  if (nutrition.protein >= 15) return "B";
  return "C";
}

export function createMealFixtures(today: string): Meal[] {
  const yesterday = shiftDate(today, -1);
  const twoDaysAgo = shiftDate(today, -2);
  return [
    {
      id: "meal-breakfast-today",
      date: today,
      time: "08:10",
      title: "燕麦与莓果",
      mealType: "breakfast",
      favorite: false,
      imageKey: "oats",
      insight: "稳定碳水，让上午的能量更平稳。",
      items: [
        { id: "oats", name: "燕麦", amount: "60g", calories: 228, protein: 8, carbs: 40, fat: 4 },
        { id: "berries", name: "莓果", amount: "80g", calories: 40, protein: 1, carbs: 9, fat: 0 },
        { id: "skyr", name: "Skyr", amount: "150g", calories: 95, protein: 17, carbs: 6, fat: 0 },
      ],
    },
    {
      id: "meal-lunch-today",
      date: today,
      time: "12:35",
      title: "香煎鸡胸米饭碗",
      mealType: "lunch",
      favorite: true,
      imageKey: "bowl",
      insight: "高蛋白、碳水均衡，适合作为训练后的餐食。",
      items: [
        {
          id: "chicken",
          name: "鸡胸肉",
          amount: "150g",
          calories: 248,
          protein: 46,
          carbs: 0,
          fat: 5,
        },
        {
          id: "rice",
          name: "白米饭",
          amount: "200g",
          calories: 232,
          protein: 5,
          carbs: 51,
          fat: 1,
        },
        {
          id: "vegetables",
          name: "西兰花与胡萝卜",
          amount: "160g",
          calories: 84,
          protein: 4,
          carbs: 14,
          fat: 1,
        },
      ],
    },
    {
      id: "meal-dinner-today",
      date: today,
      time: "19:10",
      title: "三文鱼土豆盘",
      mealType: "dinner",
      favorite: false,
      imageKey: "salmon",
      insight: "优质脂肪已接近目标，晚间不需要再额外加坚果。",
      items: [
        {
          id: "salmon",
          name: "三文鱼",
          amount: "180g",
          calories: 374,
          protein: 40,
          carbs: 0,
          fat: 24,
        },
        {
          id: "potato",
          name: "烤土豆",
          amount: "260g",
          calories: 208,
          protein: 5,
          carbs: 47,
          fat: 0,
        },
        {
          id: "greens",
          name: "绿叶菜",
          amount: "120g",
          calories: 35,
          protein: 3,
          carbs: 6,
          fat: 0,
        },
      ],
    },
    {
      id: "meal-snack-today",
      date: today,
      time: "16:20",
      title: "香蕉蛋白奶昔",
      mealType: "snack",
      favorite: false,
      imageKey: null,
      insight: "补足训练日前后的蛋白质节奏。",
      items: [
        {
          id: "banana",
          name: "香蕉",
          amount: "1 根",
          calories: 105,
          protein: 1,
          carbs: 27,
          fat: 0,
        },
        {
          id: "whey",
          name: "乳清蛋白",
          amount: "30g",
          calories: 120,
          protein: 24,
          carbs: 3,
          fat: 2,
        },
      ],
    },
    {
      id: "meal-lunch-yesterday",
      date: yesterday,
      time: "12:15",
      title: "火鸡藜麦沙拉",
      mealType: "lunch",
      favorite: true,
      imageKey: "bowl",
      insight: "纤维和蛋白质配合得很均衡。",
      items: [
        {
          id: "turkey",
          name: "火鸡胸",
          amount: "140g",
          calories: 210,
          protein: 40,
          carbs: 0,
          fat: 4,
        },
        {
          id: "quinoa",
          name: "藜麦",
          amount: "160g",
          calories: 192,
          protein: 7,
          carbs: 34,
          fat: 3,
        },
        {
          id: "avocado",
          name: "牛油果",
          amount: "50g",
          calories: 80,
          protein: 1,
          carbs: 4,
          fat: 7,
        },
      ],
    },
    {
      id: "meal-breakfast-two-days",
      date: twoDaysAgo,
      time: "07:50",
      title: "鸡蛋全麦吐司",
      mealType: "breakfast",
      favorite: false,
      imageKey: null,
      insight: "简单但足够稳定的晨间蛋白来源。",
      items: [
        { id: "eggs", name: "鸡蛋", amount: "2 个", calories: 140, protein: 12, carbs: 1, fat: 10 },
        {
          id: "toast",
          name: "全麦吐司",
          amount: "2 片",
          calories: 180,
          protein: 8,
          carbs: 32,
          fat: 2,
        },
      ],
    },
  ];
}
