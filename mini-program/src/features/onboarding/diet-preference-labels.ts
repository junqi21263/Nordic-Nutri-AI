import {
  dietaryPatternOptions,
  foodAvoidanceOptions,
} from "./diet-preferences-config";

const patternLabelByValue = Object.fromEntries(
  dietaryPatternOptions.map((option) => [option.value, option.label]),
) as Record<string, string>;

const avoidanceLabelByValue = Object.fromEntries(
  foodAvoidanceOptions.map((option) => [option.value, option.label]),
) as Record<string, string>;

export function dietaryPatternLabel(value: string | null | undefined): string {
  if (!value || value === "none") return "无特殊";
  return patternLabelByValue[value] ?? value;
}

export function foodAvoidanceLabel(value: string): string {
  return avoidanceLabelByValue[value] ?? value;
}

export function foodAvoidanceLabels(values: string[] | null | undefined): string[] {
  if (!Array.isArray(values) || values.length === 0) return [];
  return values.map(foodAvoidanceLabel);
}

/** Compact Chinese summary for profile / insight copy. */
export function formatDietPreferencesSummary(input: {
  dietaryPattern?: string | null;
  foodAvoidances?: string[] | null;
  mealsPerDay?: number | string | null;
}): string {
  const pattern = dietaryPatternLabel(input.dietaryPattern);
  const avoidances = foodAvoidanceLabels(input.foodAvoidances);
  const mealsRaw = Number(input.mealsPerDay);
  const meals =
    Number.isFinite(mealsRaw) && mealsRaw >= 2 && mealsRaw <= 5 ? `${mealsRaw} 餐/天` : "3 餐/天";

  const parts = [pattern === "无特殊" ? "均衡饮食" : pattern];
  if (avoidances.length) {
    parts.push(`忌${avoidances.slice(0, 3).join("、")}${avoidances.length > 3 ? "等" : ""}`);
  }
  parts.push(meals);
  return parts.join(" · ");
}

export function formulaPlanInsight(input: {
  dietaryPattern?: string | null;
  foodAvoidances?: string[] | null;
  mealsPerDay?: number | string | null;
}): string {
  const summary = formatDietPreferencesSummary(input);
  return `按${summary}，结合身体数据生成每日营养目标。`.slice(0, 40);
}
