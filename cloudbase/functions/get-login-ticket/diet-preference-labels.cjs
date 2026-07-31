const DIETARY_PATTERN_LABELS = {
  none: "无特殊",
  vegetarian: "素食为主",
  vegan: "纯素饮食",
  pescatarian: "鱼素饮食",
  low_carb: "低碳饮食",
  keto: "生酮饮食",
  mediterranean: "地中海饮食",
  halal: "清真饮食",
};

const FOOD_AVOIDANCE_LABELS = {
  dairy: "乳制品",
  nuts: "坚果",
  seafood: "海鲜",
  beef: "牛肉",
  eggs: "鸡蛋",
  gluten: "麸质",
  pork: "猪肉",
  soy: "大豆",
  spicy: "辛辣食物",
};

function dietaryPatternLabel(value) {
  if (!value || value === "none") return "无特殊";
  return DIETARY_PATTERN_LABELS[value] || String(value);
}

function foodAvoidanceLabel(value) {
  return FOOD_AVOIDANCE_LABELS[value] || String(value);
}

function foodAvoidanceLabels(values) {
  if (!Array.isArray(values) || !values.length) return [];
  return values.map(foodAvoidanceLabel);
}

function formatDietPreferencesSummary({ dietaryPattern, foodAvoidances, mealsPerDay } = {}) {
  const pattern = dietaryPatternLabel(dietaryPattern);
  const avoidances = foodAvoidanceLabels(foodAvoidances);
  const mealsRaw = Number(mealsPerDay);
  const meals =
    Number.isFinite(mealsRaw) && mealsRaw >= 2 && mealsRaw <= 5 ? `${mealsRaw} 餐/天` : "3 餐/天";
  const parts = [pattern === "无特殊" ? "均衡饮食" : pattern];
  if (avoidances.length) {
    parts.push(`忌${avoidances.slice(0, 3).join("、")}${avoidances.length > 3 ? "等" : ""}`);
  }
  parts.push(meals);
  return parts.join(" · ");
}

function formulaPlanInsight(input = {}) {
  return `按${formatDietPreferencesSummary(input)}，结合身体数据生成每日营养目标。`.slice(0, 40);
}

module.exports = {
  DIETARY_PATTERN_LABELS,
  FOOD_AVOIDANCE_LABELS,
  dietaryPatternLabel,
  foodAvoidanceLabel,
  foodAvoidanceLabels,
  formatDietPreferencesSummary,
  formulaPlanInsight,
};
