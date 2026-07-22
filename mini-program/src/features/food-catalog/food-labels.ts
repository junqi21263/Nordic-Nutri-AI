import type { ProductFoodCatalogItem } from "../../api/food-catalog-api";

export const FOOD_CATEGORIES = [
  "全部",
  "肉禽",
  "鱼虾海鲜",
  "蛋类",
  "乳制品",
  "豆制品",
  "谷薯主食",
  "蔬菜水果",
  "其他",
] as const;

export const FOOD_TAGS = ["全部", "高蛋白", "低脂", "高碳水", "低热量", "植物蛋白"] as const;

export type FoodCategory = (typeof FOOD_CATEGORIES)[number];
export type FoodTag = (typeof FOOD_TAGS)[number];

function sourceText(food: ProductFoodCatalogItem) {
  return [food.description, food.brandName, food.category, food.dataType]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function getFoodCategory(food: ProductFoodCatalogItem): Exclude<FoodCategory, "全部"> {
  const text = sourceText(food);
  if (/(salmon|tuna|fish|shrimp|prawn|crab|seafood|cod)/.test(text)) return "鱼虾海鲜";
  if (/(beef|chicken|turkey|pork|lamb|meat|steak|ham|sausage)/.test(text)) return "肉禽";
  if (/(egg|omelet)/.test(text)) return "蛋类";
  if (/(milk|yogurt|cheese|skyr|kefir|cream)/.test(text)) return "乳制品";
  if (/(tofu|soy|bean|lentil|chickpea|tempeh)/.test(text)) return "豆制品";
  if (/(rice|oat|oatmeal|bread|pasta|noodle|potato|grain|cereal|tortilla)/.test(text)) return "谷薯主食";
  if (/(apple|banana|avocado|berry|fruit|vegetable|broccoli|tomato|spinach|salad)/.test(text)) return "蔬菜水果";
  return "其他";
}

export function getFoodTags(food: ProductFoodCatalogItem): Exclude<FoodTag, "全部">[] {
  const tags: Exclude<FoodTag, "全部">[] = [];
  const protein = food.proteinGPer100g ?? 0;
  const fat = food.fatGPer100g ?? Number.POSITIVE_INFINITY;
  const carbs = food.carbsGPer100g ?? 0;
  const calories = food.caloriesKcalPer100g ?? Number.POSITIVE_INFINITY;
  const category = getFoodCategory(food);

  if (protein >= 15) tags.push("高蛋白");
  if (fat <= 5) tags.push("低脂");
  if (carbs >= 20) tags.push("高碳水");
  if (calories <= 100) tags.push("低热量");
  if (category === "豆制品") tags.push("植物蛋白");
  return tags;
}

export function matchesFoodFilters(
  food: ProductFoodCatalogItem,
  category: FoodCategory,
  tag: FoodTag,
) {
  return (category === "全部" || getFoodCategory(food) === category)
    && (tag === "全部" || getFoodTags(food).includes(tag));
}
