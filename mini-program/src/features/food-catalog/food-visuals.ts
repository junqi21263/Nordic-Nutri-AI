import type { NordicIconName } from "../../components/nordic-icon";

export type FoodImagePayload = {
  thumbnailUrl?: string | null;
  listUrl?: string | null;
  detailUrl?: string | null;
  source?: string | null;
  isFallback?: boolean;
};

type FoodVisualInput = {
  description: string;
  imageUrl?: string | null;
  image?: FoodImagePayload | null;
};

export type FoodVisualTone =
  | "seafood"
  | "meat"
  | "egg"
  | "dairy"
  | "grain"
  | "produce"
  | "soy"
  | "default";

export type FoodVisualFallback = {
  tone: FoodVisualTone;
  icon: NordicIconName;
};

// Meat/seafood before fruit so names like "Orange chicken" stay on meat.
const CATEGORY_FALLBACK: Array<{ pattern: RegExp; tone: FoodVisualTone; icon: NordicIconName }> = [
  { pattern: /(salmon|tuna|fish|shrimp|prawn|crab|seafood|cod|sardine|mackerel|trout|lobster|clam|oyster|scallop|mussel|anchovy)/, tone: "seafood", icon: "food-fish" },
  { pattern: /(beef|chicken|turkey|pork|lamb|meat|steak|ham|sausage|bacon|duck|veal|venison|鸡胸|鸡|牛|猪|羊)/, tone: "meat", icon: "protein" },
  { pattern: /(^|[^a-z])(eggs?|omelets?|omelettes?)([^a-z]|$)|鸡蛋|蛋类/, tone: "egg", icon: "food-egg" },
  { pattern: /(milk|yogurt|yoghurt|cheese|skyr|kefir|cream|butter|dairy|牛奶|酸奶)/, tone: "dairy", icon: "food-milk" },
  { pattern: /(rice|oat|oatmeal|bread|pasta|noodle|potato|grain|cereal|tortilla|quinoa|wheat|barley|corn|noodles|couscous|porridge|granola|musli|米饭|面包)/, tone: "grain", icon: "carbs" },
  { pattern: /(apple|banana|avocado|berry|fruit|blueberry|orange|strawberry|grape|melon|pear|mango|pineapple|kiwi|peach|cherry|lemon|lime|fig|date|水果)/, tone: "produce", icon: "food-apple" },
  { pattern: /(vegetable|broccoli|tomato|spinach|salad|carrot|cucumber|pepper|mushroom|kale|cabbage|lettuce|onion|garlic|zucchini|eggplant|cauliflower|asparagus|green bean|蔬菜)/, tone: "produce", icon: "food-carrot" },
  { pattern: /(tofu|soy|bean|lentil|chickpea|tempeh|edamame|legume|pea|豆腐)/, tone: "soy", icon: "food-bean" },
  { pattern: /(nut|almond|walnut|cashew|pecan|hazelnut|peanut|seed|pistachio|macadamia)/, tone: "grain", icon: "carbs" },
];

/**
 * Accept https images from CloudBase CDN or Open Food Facts.
 * USDA foundation foods usually have no photo — those keep category placeholders.
 */
function isTrustedFoodImageUrl(url: string) {
  if (!/^https:\/\//i.test(url)) return false;
  return (
    /openfoodfacts\.org/i.test(url)
    || /\.tcloudbaseapp\.com\//i.test(url)
    || /\.tcloudbase\.com\//i.test(url)
    || /\.tcb\.qcloud\.la\//i.test(url)
    || /\.myqcloud\.com\//i.test(url)
  );
}

function pickPreferredUrl(food: FoodVisualInput, prefer: "list" | "detail" | "thumb" = "list") {
  const nested = food.image;
  if (nested && !nested.isFallback) {
    const ordered =
      prefer === "detail"
        ? [nested.detailUrl, nested.listUrl, nested.thumbnailUrl]
        : prefer === "thumb"
          ? [nested.thumbnailUrl, nested.listUrl, nested.detailUrl]
          : [nested.listUrl, nested.thumbnailUrl, nested.detailUrl];
    for (const candidate of ordered) {
      const url = candidate?.trim();
      if (url && isTrustedFoodImageUrl(url)) return url;
    }
  }
  const flat = food.imageUrl?.trim();
  if (flat && isTrustedFoodImageUrl(flat)) return flat;
  return null;
}

export function resolveFoodVisual(food: FoodVisualInput, prefer: "list" | "detail" | "thumb" = "list") {
  return pickPreferredUrl(food, prefer);
}

/** Category-aware placeholder metadata — rendered as View + NordicIcon. */
export function getFoodVisualFallback(food: FoodVisualInput): FoodVisualFallback {
  const normalized = food.description.toLowerCase();
  for (const rule of CATEGORY_FALLBACK) {
    if (rule.pattern.test(normalized)) return { tone: rule.tone, icon: rule.icon };
  }
  return { tone: "default", icon: "utensils" };
}
