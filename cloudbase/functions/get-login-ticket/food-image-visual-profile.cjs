// A nutrition variant describes nutrition data. A visual profile describes the
// appearance that needs a photograph. They deliberately have different keys:
// many nutrition variants can share one food image.

const VISUAL_PROFILES = Object.freeze({
  standard: { key: "standard", labelZh: "默认食材", promptHint: "按该食材最常见、最容易辨识的可食用形态呈现，不制作成复杂菜肴" },
  raw: { key: "raw", labelZh: "生鲜原料", promptHint: "生鲜未烹调原料状态，保持自然色泽、切面与肌理，不出现熟制、煎烤或酱汁" },
  cooked_plain: { key: "cooked_plain", labelZh: "清淡熟制", promptHint: "清淡熟制状态，以水煮、清蒸或白灼为主，无焦痕、煎烤、浓酱或油炸" },
  fresh: { key: "fresh", labelZh: "新鲜食材", promptHint: "新鲜可食用状态，保留自然表皮、叶片、果肉或切面，不制作成拼盘、沙拉或甜品" },
  dry: { key: "dry", labelZh: "干制原料", promptHint: "干制或干货原料状态，颗粒、片状或干燥质地清晰，不加汤汁或熟菜搭配" },
});

function normalizeVisualProfileKey(value) {
  const key = String(value || "auto").trim().toLowerCase();
  if (key === "" || key === "auto") return "auto";
  return VISUAL_PROFILES[key] ? key : "standard";
}

function getVisualProfileDefinition(value) {
  const key = normalizeVisualProfileKey(value);
  return VISUAL_PROFILES[key === "auto" ? "standard" : key];
}

function profileEvidence(food = {}) {
  return [
    food.variantLabelZh,
    food.defaultCookingMethod,
    food.cookingMethod,
    food.foodForm,
    food.nameZh,
    food.nameEn,
    food.category?.code,
    food.category?.nameZh,
  ].filter(Boolean).join(" ").toLowerCase();
}

function inferVisualProfileKey(food = {}) {
  const evidence = profileEvidence(food);
  if (/(熟制|熟食|水煮|白灼|清蒸|蒸制|炖煮|煮熟|cooked|boiled|steamed)/i.test(evidence)) return "cooked_plain";
  if (/(干制|干货|风干|晒干|dried|dehydrated)/i.test(evidence)) return "dry";
  if (/(肉禽|牛肉|猪肉|羊肉|鸡肉|鸡胸|火鸡|鱼虾海鲜|海鲜|三文鱼|金枪鱼|虾|蟹|贝类|meat|poultry|seafood|fish|shellfish)/i.test(evidence)) return "raw";
  if (/(蔬菜|水果|番茄|菠菜|西兰花|叶菜|根茎|苹果|香蕉|牛油果|蓝莓|vegetable|fruit)/i.test(evidence)) return "fresh";
  if (/(谷物|坚果|种子|燕麦|米|麦|豆类|干豆|grain|nut|seed)/i.test(evidence)) return "dry";
  return "standard";
}

function resolveVisualProfile(food = {}, requestedKey = "auto") {
  const requested = normalizeVisualProfileKey(requestedKey);
  const key = requested === "auto"
    ? normalizeVisualProfileKey(food.visualProfileKey || food.visual_profile_key || inferVisualProfileKey(food))
    : requested;
  return getVisualProfileDefinition(key);
}

module.exports = {
  VISUAL_PROFILES,
  normalizeVisualProfileKey,
  getVisualProfileDefinition,
  inferVisualProfileKey,
  resolveVisualProfile,
};
