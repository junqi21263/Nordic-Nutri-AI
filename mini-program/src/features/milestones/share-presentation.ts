import type { MilestoneHighlight } from "./stats";
import type { Milestone } from "./stats";

type SharePresentationInput = {
  milestone: Milestone;
  mealsLogged: number;
  frozenHighlights?: MilestoneHighlight[];
};

export type MilestoneShareMetric = {
  icon: "utensils" | "calendar-days" | "goal-performance" | "protein" | "carbs";
  label: string;
  value: string;
};

const messages: Record<Milestone, string> = {
  3: "连续记录 3 天，原来从认真吃好每一餐开始，饮食节奏真的会慢慢变稳。",
  7: "连续记录 7 天，你正在把每一餐的选择，慢慢过成自己的饮食节奏。",
  14: "连续记录 14 天，你已开始看见更平衡的变化，继续把这份照顾留给自己。",
  30: "连续记录 30 天，健康饮食不再是一时热情，而是你正在拥有的生活方式。",
};

function frozenValue(input: SharePresentationInput, key: MilestoneHighlight["key"], fallback = "—") {
  return input.frozenHighlights?.find((item) => item.key === key)?.value ?? fallback;
}

function withMealUnit(value: string) {
  return /餐\s*$/.test(value) ? value : `${value} 餐`;
}

export function getMilestoneShareMessage(milestone: Milestone) {
  return messages[milestone];
}

/**
 * Read-only display mapping for share cards. It selects from the frozen
 * snapshot values, never recalculates the user's cycle or achievement data.
 */
export function getMilestoneShareMetrics(input: SharePresentationInput): MilestoneShareMetric[] {
  const meals = frozenValue(input, "mealsLogged", input.mealsLogged > 0 ? String(input.mealsLogged) : "—");
  switch (input.milestone) {
    case 3:
      return [
        { icon: "utensils", label: "已记录餐次", value: withMealUnit(meals) },
        { icon: "calendar-days", label: "连续记录", value: "3 天" },
      ];
    case 7:
      return [
        { icon: "goal-performance", label: "饮食目标完成", value: frozenValue(input, "targetCompletionRate") },
        { icon: "utensils", label: "已记录餐次", value: withMealUnit(meals) },
      ];
    case 14:
      return [
        { icon: "protein", label: "平均蛋白质", value: frozenValue(input, "avgProtein") },
        { icon: "carbs", label: "平均碳水", value: frozenValue(input, "avgCarbs") },
      ];
    case 30:
      return [
        { icon: "calendar-days", label: "连续记录", value: "30 天" },
        { icon: "protein", label: "平均蛋白质", value: frozenValue(input, "avgProtein") },
      ];
  }
}
