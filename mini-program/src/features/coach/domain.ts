import { getDailySummary, type DailyTargets, type Meal } from "../meals/domain";
import { getAchievementRequirement } from "./achievement-catalog";
export interface CoachAdvice {
  id: string;
  title: string;
  message: string;
  favorite: boolean;
  dismissed: boolean;
  category: "protein" | "recovery" | "mission" | "workout";
}
export interface Achievement {
  id: string;
  title: string;
  unlocked: boolean;
  progress: number;
  available?: boolean;
  metric?: number;
  target?: number;
  unit?: string;
  requirement?: string;
  unlockedAt?: string | null;
  /** Set only by the server response that persisted this completion. */
  justUnlocked?: boolean;
  /** Server-owned delivery state. Remains true until the celebration is acknowledged. */
  celebrationPending?: boolean;
}
export function createCoachAdvice(
  meals: Meal[],
  date: string,
  targets?: DailyTargets,
): CoachAdvice[] {
  const summary = getDailySummary(meals, date, targets);
  const proteinLeft = Math.max(0, summary.protein - summary.consumed.protein);
  return [
    {
      id: "protein",
      title: "Protein Goal",
      message: proteinLeft
        ? `今天还差 ${proteinLeft}g 蛋白质，晚餐优先安排瘦肉或酸奶。`
        : "蛋白质目标已完成，恢复节奏很好。",
      favorite: false,
      dismissed: false,
      category: "protein",
    },
    {
      id: "recovery",
      title: "Recovery",
      message: "睡眠目标 7.5 小时；训练后记得补充水分。",
      favorite: false,
      dismissed: false,
      category: "recovery",
    },
    {
      id: "mission",
      title: "Today's Mission",
      message: `完成今天 ${summary.completion}% 的能量目标，并记录下一餐。`,
      favorite: false,
      dismissed: false,
      category: "mission",
    },
    {
      id: "workout",
      title: "Workout Reminder",
      message: "今天安排力量训练，训练前 60 分钟补一份碳水。",
      favorite: false,
      dismissed: false,
      category: "workout",
    },
  ];
}
export function createAchievements(meals: Meal[], date: string): Achievement[] {
  void date;
  const count = meals.length;
  const names = [
    "第一餐记录",
    "早餐节奏",
    "午餐专注",
    "晚餐平衡",
    "加餐有度",
    "蛋白达人",
    "连续七天",
    "连续十四天",
    "累计三十餐",
    "累计五十餐",
    "累计一百餐",
    "水分自律",
    "睡眠优先",
    "认识自己",
    "恢复达人",
    "蔬菜优先",
    "碳水平衡",
    "低脂选择",
    "收藏灵感",
    "连续达标",
  ];
  return names.map((title, index) => {
    const target = index + 1;
    const progress = Math.min(100, Math.round((count / target) * 100));
    return {
      id: `achievement-${index}`,
      title,
      unlocked: count >= target || index < 3,
      progress,
      available: true,
      metric: Math.min(count, target),
      target,
      unit: "餐",
      requirement: getAchievementRequirement(title),
      unlockedAt: null,
    };
  });
}
