type WeeklyComparisonDelta = {
  recordedDays: number;
  recordedMeals: number;
};

type ComparisonCopy = {
  prefix: string; recordedDays: string; recordedMeals: string;
  more: string; fewer: string; same: string; dayUnit: string; mealUnit: string;
  colon: string; separator: string;
};

const defaultCopy: ComparisonCopy = {
  prefix: "较上周同期", recordedDays: "记录天数", recordedMeals: "餐数",
  more: "多", fewer: "少", same: "持平", dayUnit: "天", mealUnit: "餐", colon: "：", separator: "，",
};

function describeDelta(value: number, label: string, unit: string, copy: ComparisonCopy) {
  if (value > 0) return `${label}${copy.more} ${value} ${unit}`;
  if (value < 0) return `${label}${copy.fewer} ${Math.abs(value)} ${unit}`;
  return `${label}${copy.same}`;
}

export function formatWeeklyComparison(comparison: WeeklyComparisonDelta, copy: ComparisonCopy = defaultCopy) {
  return `${copy.prefix}${copy.colon}${describeDelta(comparison.recordedDays, copy.recordedDays, copy.dayUnit, copy)}${copy.separator}${describeDelta(comparison.recordedMeals, copy.recordedMeals, copy.mealUnit, copy)}`;
}
