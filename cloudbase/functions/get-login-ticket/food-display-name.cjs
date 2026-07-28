// Localized display-name fallback for imported food records.
// USDA provides reliable nutrition values but generally does not provide a
// Chinese name. Keep the original name for search/storage, and only localize
// the public display label when it is safe to recognize the food.

const EXACT_NAMES = new Map([
  ["soup, chicken", "鸡肉汤"],
  ["orange chicken", "香橙鸡肉"],
  ["chicken, ground", "绞碎鸡肉"],
  ["chicken, chicken roll, roasted", "烤鸡肉卷"],
]);

const PRIMARY_NAMES = new Map([
  ["chicken", "鸡肉"],
  ["beef", "牛肉"],
  ["pork", "猪肉"],
  ["turkey", "火鸡肉"],
  ["duck", "鸭肉"],
  ["lamb", "羊肉"],
  ["fish", "鱼肉"],
  ["salmon", "三文鱼"],
  ["tuna", "金枪鱼"],
  ["shrimp", "虾"],
  ["prawn", "虾"],
  ["crab", "螃蟹"],
  ["egg", "鸡蛋"],
  ["milk", "牛奶"],
  ["yogurt", "酸奶"],
  ["yoghurt", "酸奶"],
  ["cheese", "奶酪"],
  ["tofu", "豆腐"],
  ["soybean", "大豆"],
  ["bean", "豆类"],
  ["rice", "米饭"],
  ["wheat", "小麦"],
  ["oat", "燕麦"],
  ["potato", "土豆"],
  ["sweet potato", "红薯"],
  ["tomato", "番茄"],
  ["mushroom", "蘑菇"],
  ["avocado", "牛油果"],
  ["apple", "苹果"],
  ["banana", "香蕉"],
  ["orange", "橙子"],
  ["carrot", "胡萝卜"],
  ["broccoli", "西兰花"],
  ["spinach", "菠菜"],
  ["cucumber", "黄瓜"],
  ["onion", "洋葱"],
  ["garlic", "大蒜"],
  ["bread", "面包"],
  ["pasta", "意面"],
  ["almond", "杏仁"],
  ["walnut", "核桃"],
  ["peanut", "花生"],
]);

function clean(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function containsChinese(value) {
  return /[\u3400-\u9fff]/u.test(value);
}

function getFoodDisplayName(food = {}) {
  const nameZh = clean(food.nameZh);
  if (nameZh) return nameZh;

  const original = clean(food.nameEn || food.normalizedName || food.description);
  if (!original || containsChinese(original)) return original || "未命名食物";

  const normalized = original.toLowerCase();
  const exact = EXACT_NAMES.get(normalized);
  if (exact) return exact;

  const primary = normalized.split(",")[0].trim();
  return PRIMARY_NAMES.get(primary) || original;
}

module.exports = { getFoodDisplayName };
