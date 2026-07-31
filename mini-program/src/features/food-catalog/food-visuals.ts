import type { NordicIconName } from "../../components/nordic-icon";

export type FoodImagePayload = {
  thumbnailUrl?: string | null;
  listUrl?: string | null;
  detailUrl?: string | null;
  source?: string | null;
  isFallback?: boolean;
  width?: number | null;
  height?: number | null;
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

// Order matters: meat/egg before produce so "番茄炒蛋" → egg, "Orange chicken" → meat.
// Chinese home-cooking names are matched by dish keywords, not catalog ids.
const CATEGORY_FALLBACK: Array<{ pattern: RegExp; tone: FoodVisualTone; icon: NordicIconName }> = [
  // Real seafood — keep "鱼香*" out (Sichuan flavor, often no fish).
  {
    pattern: new RegExp(
      [
        "salmon|tuna|shrimp|prawn|crab|seafood|cod|sardine|mackerel|trout|lobster|clam|oyster|scallop|mussel|anchovy|fish",
        "三文鱼|鲈鱼|带鱼|黄鱼|鳕鱼|鱼片|烤鱼|清蒸鱼|水煮鱼|酸菜鱼|海鲜|虾仁|大虾|螃蟹|鱿鱼|鱼汤",
      ].join("|"),
      "i",
    ),
    tone: "seafood",
    icon: "food-fish",
  },
  {
    pattern: new RegExp(
      [
        "beef|chicken|turkey|pork|lamb|meat|steak|ham|sausage|bacon|duck|veal|venison",
        "鸡胸|鸡肉|牛肉|猪肉|羊肉|鸡丁|肉丝|肉片|排骨|红烧肉|回锅肉|宫保鸡|鱼香肉|小炒肉|鸡|牛|猪|羊",
      ].join("|"),
      "i",
    ),
    tone: "meat",
    icon: "protein",
  },
  {
    pattern: new RegExp(
      [
        "(^|[^a-z])(eggs?|omelets?|omelettes?)([^a-z]|$)",
        "鸡蛋|蛋类|炒蛋|蛋炒|煎蛋|蒸蛋|蛋羹|蛋花|荷包蛋|茶叶蛋|番茄炒蛋|西红柿炒蛋",
      ].join("|"),
      "i",
    ),
    tone: "egg",
    icon: "food-egg",
  },
  {
    pattern: /milk|yogurt|yoghurt|cheese|skyr|kefir|cream|butter|dairy|牛奶|酸奶|奶酪/i,
    tone: "dairy",
    icon: "food-milk",
  },
  {
    pattern: new RegExp(
      [
        "rice|oat|oatmeal|bread|pasta|noodle|potato|grain|cereal|tortilla|quinoa|wheat|barley|corn|noodles|couscous|porridge|granola|musli",
        "米饭|炒饭|盖浇饭|面包|燕麦|面条|米线|米粉|馒头|包子|饺子|馄饨|土豆",
      ].join("|"),
      "i",
    ),
    tone: "grain",
    icon: "carbs",
  },
  {
    pattern: new RegExp(
      [
        "apple|banana|avocado|berry|fruit|blueberry|orange|strawberry|grape|melon|pear|mango|pineapple|kiwi|peach|cherry|lemon|lime|fig|date",
        "水果|香蕉|苹果|橙子|草莓|葡萄|西瓜|芒果|梨",
      ].join("|"),
      "i",
    ),
    tone: "produce",
    icon: "food-apple",
  },
  {
    pattern: new RegExp(
      [
        "vegetable|broccoli|tomato|spinach|salad|carrot|cucumber|pepper|mushroom|kale|cabbage|lettuce|onion|garlic|zucchini|eggplant|cauliflower|asparagus|green bean",
        "蔬菜|西兰花|番茄|西红柿|菠菜|生菜|胡萝卜|茄子|鱼香茄子|地三鲜|青椒|黄瓜|白菜|芹菜|洋葱|蒜苔|豆角",
      ].join("|"),
      "i",
    ),
    tone: "produce",
    icon: "food-carrot",
  },
  {
    pattern: /tofu|soy|bean|lentil|chickpea|tempeh|edamame|legume|pea|豆腐|豆浆|麻婆豆腐|豆腐干/i,
    tone: "soy",
    icon: "food-bean",
  },
  {
    pattern: /nut|almond|walnut|cashew|pecan|hazelnut|peanut|seed|pistachio|macadamia|坚果/i,
    tone: "grain",
    icon: "carbs",
  },
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

/** Keep detail pages square by default, but honor dimensions when the API provides them. */
export function getFoodVisualAspectRatio(food: FoodVisualInput) {
  const width = Number(food.image?.width);
  const height = Number(food.image?.height);
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return width / height;
  }
  return 1;
}

/** Category-aware placeholder metadata — rendered as View + NordicIcon. */
export function getFoodVisualFallback(food: FoodVisualInput): FoodVisualFallback {
  const normalized = food.description.toLowerCase();
  for (const rule of CATEGORY_FALLBACK) {
    if (rule.pattern.test(normalized)) return { tone: rule.tone, icon: rule.icon };
  }
  return { tone: "default", icon: "utensils" };
}
