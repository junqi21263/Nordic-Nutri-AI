import type { ProductFoodCatalogItem } from "../../api/food-catalog-api";

/** Fallback chip labels when the categories API is unavailable. */
export const FOOD_CATEGORIES = [
  "全部",
  "肉禽",
  "北欧常见食材",
  "北美常见食材",
  "鱼虾海鲜",
  "蛋类与乳制品",
  "豆类与植物蛋白",
  "谷物与薯类",
  "蔬菜",
  "水果",
  "坚果与种子",
  "油脂与调味",
  "饮品",
  "烘焙与基础加工食材",
  "地域特色常用食材",
] as const;

/** Fallback tag labels when the tags API is unavailable. */
export const FOOD_TAGS = [
  "全部",
  "高蛋白",
  "低脂",
  "高碳水",
  "低热量",
  "植物蛋白",
  "高膳食纤维",
] as const;

export type FoodCategory = (typeof FOOD_CATEGORIES)[number] | string;
export type FoodTag = (typeof FOOD_TAGS)[number] | string;

export const STANDARD_FOOD_CATEGORY_ROOT_CODES = new Set([
  "meat_poultry", "seafood", "egg_dairy", "plant_protein", "grains_tubers", "vegetables",
  "fruits", "nuts_seeds", "oils_seasonings", "beverages", "basic_processed", "regional_staples",
  "nordic_staples", "north_american_staples",
]);

const STANDARD_CATEGORY_LABELS: Record<string, Exclude<FoodCategory, "全部">> = {
  meat_poultry: "肉禽",
  seafood: "鱼虾海鲜",
  egg_dairy: "蛋类与乳制品",
  plant_protein: "豆类与植物蛋白",
  grains_tubers: "谷物与薯类",
  vegetables: "蔬菜",
  fruits: "水果",
  nuts_seeds: "坚果与种子",
  oils_seasonings: "油脂与调味",
  beverages: "饮品",
  basic_processed: "烘焙与基础加工食材",
  regional_staples: "地域特色常用食材",
  nordic_staples: "北欧常见食材",
  north_american_staples: "北美常见食材",
};

/**
 * English USDA search keywords keyed by Chinese category label.
 * Tapping a category must hit USDA/cache search — not filter the tiny discover list.
 */
export const CATEGORY_SEARCH_QUERIES: Record<string, string> = {
  肉禽: "chicken breast beef pork turkey lamb",
  鱼虾海鲜: "salmon shrimp tuna cod crab",
  蛋类: "egg whole cooked",
  乳制品: "milk greek yogurt cheese cottage",
  豆制品: "tofu soybeans chickpeas lentils tempeh",
  谷物: "rice oatmeal bread pasta quinoa potato",
  蔬菜: "broccoli spinach carrot tomato cucumber",
  水果: "apple banana blueberry strawberry orange",
  饮料: "orange juice coffee tea almond milk",
  调味品: "olive oil soy sauce honey mustard",
  混合菜: "salad stew soup casserole chili",
  其他: "almonds walnuts peanut butter",
  "蛋类与乳制品": "egg whole cooked milk greek yogurt cheese",
  "豆类与植物蛋白": "tofu soybeans chickpeas lentils tempeh",
  "谷物与薯类": "rice oatmeal bread pasta quinoa potato",
  坚果与种子: "almonds walnuts peanut seeds",
  "油脂与调味": "olive oil soy sauce honey mustard",
  饮品: "orange juice coffee tea almond milk",
  "烘焙与基础加工食材": "bread flour oats pasta tofu",
  地域特色常用食材: "salmon rye oats skyr maple syrup",
  北欧常见食材: "salmon cod herring rye oats skyr lingonberry",
  北美常见食材: "turkey corn maple syrup peanut butter pecan avocado",
};

/** Same keywords keyed by server food_categories.code for reliable lookup. */
export const CATEGORY_SEARCH_BY_CODE: Record<string, string> = {
  meat: CATEGORY_SEARCH_QUERIES["肉禽"],
  seafood: CATEGORY_SEARCH_QUERIES["鱼虾海鲜"],
  egg: CATEGORY_SEARCH_QUERIES["蛋类"],
  dairy: CATEGORY_SEARCH_QUERIES["乳制品"],
  soy: CATEGORY_SEARCH_QUERIES["豆制品"],
  grain: CATEGORY_SEARCH_QUERIES["谷物"],
  vegetable: CATEGORY_SEARCH_QUERIES["蔬菜"],
  fruit: CATEGORY_SEARCH_QUERIES["水果"],
  beverage: CATEGORY_SEARCH_QUERIES["饮料"],
  seasoning: CATEGORY_SEARCH_QUERIES["调味品"],
  mixed_dish: CATEGORY_SEARCH_QUERIES["混合菜"],
  other: CATEGORY_SEARCH_QUERIES["其他"],
};

export function resolveCategorySearchQuery(category: FoodCategory, categoryCode?: string | null) {
  if (category === "全部") return null;
  if (categoryCode === "nordic_staples" || categoryCode === "north_american_staples") return null;
  if (categoryCode && CATEGORY_SEARCH_BY_CODE[categoryCode]) {
    return CATEGORY_SEARCH_BY_CODE[categoryCode];
  }
  return CATEGORY_SEARCH_QUERIES[category] ?? (String(category).trim() || null);
}

function sourceText(food: ProductFoodCatalogItem) {
  return [food.description, food.brandName, food.category, food.dataType]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/** Infer a Chinese category label for USDA/cache items without a server category. */
export function getFoodCategory(food: ProductFoodCatalogItem): Exclude<FoodCategory, "全部"> {
  const categoryCode = String(food.category ?? "").split(".")[0];
  if (STANDARD_CATEGORY_LABELS[categoryCode]) return STANDARD_CATEGORY_LABELS[categoryCode];
  const text = sourceText(food);
  if (
    /(salmon|tuna|fish|shrimp|prawn|crab|seafood|cod|sardine|mackerel|trout|lobster|clam|oyster|scallop|mussel|anchovy)/.test(
      text,
    )
  ) {
    return "鱼虾海鲜";
  }
  if (/(beef|chicken|turkey|pork|lamb|meat|steak|ham|sausage|bacon|duck|veal)/.test(text)) return "肉禽";
  // Word-boundary for egg so "eggplant" does not become 蛋类.
  if (/(^|[^a-z])(eggs?|omelets?|omelettes?)([^a-z]|$)/.test(text)) return "蛋类";
  if (/(milk|yogurt|yoghurt|cheese|skyr|kefir|cream|cottage|butter)/.test(text)) return "乳制品";
  if (/(tofu|soy|bean|lentil|chickpea|tempeh|edamame|legume)/.test(text)) return "豆制品";
  if (/(juice|soda|beverage|drink|cola|coffee|tea|smoothie)/.test(text)) return "饮料";
  if (
    /(rice|oat|oatmeal|bread|pasta|noodle|potato|grain|cereal|tortilla|quinoa|wheat|barley|couscous)/.test(
      text,
    )
  ) {
    return "谷物";
  }
  if (
    /(apple|banana|avocado|berry|fruit|blueberry|orange|strawberry|grape|mango|pear|peach|kiwi|pineapple|watermelon)/.test(
      text,
    )
  ) {
    return "水果";
  }
  if (
    /(vegetable|broccoli|tomato|spinach|salad|carrot|cucumber|pepper|mushroom|eggplant|lettuce|cabbage|kale|onion|garlic|zucchini|cauliflower|asparagus)/.test(
      text,
    )
  ) {
    return "蔬菜";
  }
  if (/(oil|honey|seasoning|sauce|mustard|vinegar|ketchup|mayonnaise|salt|pepper)/.test(text)) {
    return "调味品";
  }
  if (/(stew|soup|casserole|chili|curry|pizza|burger|sandwich|mixed)/.test(text)) return "混合菜";
  if (/(almond|walnut|cashew|peanut|pistachio|snack|chip|cracker)/.test(text)) return "其他";
  return "其他";
}

/** Infer tag labels using the same thresholds as the server auto-tag rules. */
export function getFoodTags(food: ProductFoodCatalogItem): Exclude<FoodTag, "全部">[] {
  const tags: Exclude<FoodTag, "全部">[] = [];
  const protein = food.proteinGPer100g ?? 0;
  const fat = food.fatGPer100g ?? Number.POSITIVE_INFINITY;
  const carbs = food.carbsGPer100g ?? 0;
  const calories = food.caloriesKcalPer100g ?? Number.POSITIVE_INFINITY;
  const category = getFoodCategory(food);

  if (protein >= 15) tags.push("高蛋白");
  if (fat <= 3) tags.push("低脂");
  if (carbs >= 30) tags.push("高碳水");
  if (calories <= 100) tags.push("低热量");
  if (category === "豆制品" || category === "谷物") tags.push("植物蛋白");
  return tags;
}

export function matchesFoodFilters(
  food: ProductFoodCatalogItem,
  category: FoodCategory,
  tag: FoodTag,
) {
  const foodCategory = getFoodCategory(food);
  const categoryMatched =
    category === "全部"
    || foodCategory === category
    // Legacy chip "蔬菜水果" maps to either vegetable or fruit.
    || (category === "蔬菜水果" && (foodCategory === "蔬菜" || foodCategory === "水果"))
    || (category === "谷薯主食" && foodCategory === "谷物");
  return categoryMatched && (tag === "全部" || getFoodTags(food).includes(tag));
}
