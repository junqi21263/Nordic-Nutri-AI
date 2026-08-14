import type { NordicIconName } from "../../components/nordic-icon";
import type { Achievement } from "./domain";

/** Distinct visual for each achievement definition (aligned with server titles). */
const ACHIEVEMENT_ICONS_BY_TITLE: Record<string, NordicIconName> = {
  第一餐记录: "utensils",
  早餐节奏: "food-bread",
  午餐专注: "food-bowl",
  晚餐平衡: "food-pot",
  加餐有度: "food-apple",
  蛋白达人: "protein",
  连续七天: "flame",
  连续十四天: "calendar-days",
  累计三十餐: "list-checks",
  累计五十餐: "milestone",
  累计一百餐: "celebration",
  水分自律: "food-cup",
  睡眠优先: "timer",
  认识自己: "user-round",
  恢复达人: "zap",
  蔬菜优先: "food-carrot",
  碳水平衡: "carbs",
  低脂选择: "fat",
  收藏灵感: "heart-filled",
  连续达标: "goal-performance",
};

const ACHIEVEMENT_ICONS_BY_ID: Record<string, NordicIconName> = {
  "achievement-0": "utensils",
  "achievement-1": "food-bread",
  "achievement-2": "food-bowl",
  "achievement-3": "food-pot",
  "achievement-4": "food-apple",
  "achievement-5": "protein",
  "achievement-6": "flame",
  "achievement-7": "calendar-days",
  "achievement-8": "list-checks",
  "achievement-9": "milestone",
  "achievement-10": "celebration",
  "achievement-11": "food-cup",
  "achievement-12": "timer",
  "achievement-13": "user-round",
  "achievement-14": "zap",
  "achievement-15": "food-carrot",
  "achievement-16": "carbs",
  "achievement-17": "fat",
  "achievement-18": "heart-filled",
  "achievement-19": "goal-performance",
};

export function getAchievementIcon(
  achievement: Pick<Achievement, "id" | "title">,
): NordicIconName {
  return (
    ACHIEVEMENT_ICONS_BY_ID[achievement.id]
    || ACHIEVEMENT_ICONS_BY_TITLE[achievement.title]
    || "milestone"
  );
}
