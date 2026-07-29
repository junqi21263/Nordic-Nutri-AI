// food-image-prompts.cjs
// Centralized Hunyuan food-photo prompts. Official API limit: 500 characters.

const MAX_PROMPT_CHARS = 500;
const { resolveVisualProfile } = require("./food-image-visual-profile.cjs");

const COOKING_HINTS = {
  水煮: "水煮，无焦痕无煎烤无酱汁无油脂",
  香煎: "浅金表面，不可焦黑，少油",
  清蒸: "清蒸本色，无煎烤痕迹",
  生鲜: "新鲜食材本色，勿生成沙拉果汁甜品",
  烘焙: "准确呈现烘焙质感，勿混甜面包与全麦",
};

const PHOTO_TEMPLATES = [
  {
    id: "egg_dairy",
    match: /蛋类|乳制品|鸡蛋|鸭蛋|鹌鹑蛋|牛奶|酸奶|奶酪|黄油|skyr/i,
    subject: "完整鸡蛋、切开鸡蛋或对应乳制品主体，形态准确、无包装",
    defaultCooking: "按食材本身呈现，保持自然颜色与质地",
    negative: "勿增加肉类、面包、麦片、水果、甜品、文字或包装",
  },
  {
    id: "meat_poultry",
    match: /肉禽|鸡|鸭|鹅|牛肉|猪肉|羊肉|火鸡|鹿肉|兔肉/,
    subject: "可食用的单一肉类主体，切面与肌理自然可见",
    defaultCooking: "按食材本身呈现；未指定做法时保持原料或清淡熟制",
    negative: "勿增加米饭、蔬菜、酱汁、烧烤焦痕、拼盘或其他肉类",
  },
  {
    id: "seafood",
    match: /鱼虾海鲜|鱼|虾|蟹|贝|蛤|牡蛎|三文鱼|金枪鱼|鳕|鲑|海鲜/,
    subject: "可食用的单一鱼类或海鲜主体，新鲜干净，纹理真实",
    defaultCooking: "按食材本身呈现；未指定做法时保持新鲜或清淡熟制",
    negative: "勿增加寿司、意面、薯条、沙拉、柠檬片、酱汁或其他海鲜",
  },
  {
    id: "plant_protein",
    match: /豆类|植物蛋白|豆腐|黄豆|鹰嘴豆|扁豆|豆浆|tempeh/i,
    subject: "单一豆类或植物蛋白主体，形态准确、可清楚辨识",
    defaultCooking: "按食材本身呈现，未指定做法时为原料或清淡熟制",
    negative: "勿增加肉类、谷物主食、蔬菜拼盘、酱汁、文字或包装",
  },
  {
    id: "grain_bakery",
    match: /谷物|烘焙|燕麦|米|麦|面包|意面|藜麦|荞麦|玉米|谷物/i,
    subject: "单一谷物、主食或基础烘焙食材，形态与颗粒质感准确",
    defaultCooking: "按食材本身呈现，避免混入其他菜品",
    negative: "勿增加肉类、蔬菜、果酱、黄油、饮料、文字或包装",
  },
  {
    id: "vegetable",
    match: /蔬菜|番茄|西兰花|菠菜|蘑菇|土豆|南瓜|胡萝卜|洋葱|叶菜|根茎/i,
    subject: "单一蔬菜主体，保留真实颜色、表皮和切面特征",
    defaultCooking: "新鲜食材本色或轻焯，未指定时不要制作成菜肴",
    negative: "勿增加肉类、谷物、沙拉拼盘、浓酱、文字或包装",
  },
  {
    id: "fruit",
    match: /水果|苹果|香蕉|牛油果|蓝莓|橙|莓|葡萄|梨|桃|芒果|柠檬/i,
    subject: "单一水果主体，成熟可食用，保留自然果皮、果肉或切面",
    defaultCooking: "新鲜食材本色，不制作成果汁、甜品或沙拉",
    negative: "勿增加麦片、酸奶、其他水果、甜品、文字或包装",
  },
  {
    id: "nuts_oil",
    match: /坚果|油脂|杏仁|核桃|花生|腰果|橄榄油|菜籽油|芝麻油/i,
    subject: "单一坚果或油脂主体，形态清楚，少量自然摆放",
    defaultCooking: "按食材本身呈现，油脂可使用无标签透明小玻璃容器或白瓷油壶",
    negative: "勿增加混合坚果、沙拉、面包、文字、标签或包装",
  },
];

function clampText(value, max) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  return text.length <= max ? text : text.slice(0, max);
}

/**
 * Build a compact Nordic food-photography prompt under the 500-char API limit.
 */
function resolveFoodPhotoTemplate({ foodNameZh, foodNameEn, category } = {}) {
  const text = `${foodNameZh || ""} ${foodNameEn || ""} ${category || ""}`;
  return PHOTO_TEMPLATES.find((template) => template.match.test(text)) || {
    id: "general_food",
    subject: "单一可食用食材主体，形态准确、清楚可辨",
    defaultCooking: "按食材本身呈现，不制作成复杂菜肴",
    negative: "勿增加其他食物、文字、包装、水印、插画或3D",
  };
}

function buildFoodImagePromptPlan(input = {}) {
  const nameZh = clampText(input.foodNameZh || input.foodNameEn, 40) || "食物";
  const nameEn = clampText(input.foodNameEn, 40);
  const cat = clampText(input.category, 16);
  const cook = clampText(input.cookingMethod, 12);
  const serving = clampText(input.servingDescription, 24);
  const retryReason = clampText(input.retryReason, 180);
  const extra = clampText([
    input.extraPrompt,
    retryReason ? `根据审核反馈修正：${retryReason}` : "",
  ].filter(Boolean).join("；"), 180);
  const template = resolveFoodPhotoTemplate({ foodNameZh: nameZh, foodNameEn: nameEn, category: cat });
  const visualProfile = resolveVisualProfile({
    nameZh,
    nameEn,
    category: input.category ? { nameZh: input.category } : null,
    defaultCookingMethod: cook,
    visualProfileKey: input.visualProfileKey,
  }, input.visualProfileKey);
  const cookingHint = COOKING_HINTS[cook] || (cook ? `${cook}烹饪，保持食材真实可食用` : visualProfile.promptHint || template.defaultCooking);
  const plan = {
    template: template.id,
    foodNameZh: nameZh,
    foodNameEn: nameEn,
    category: cat,
    subject: template.subject,
    cookingHint,
    servingDescription: serving,
    negativePrompt: template.negative,
    extraPrompt: extra,
    retryReason: retryReason || null,
    visualProfileKey: visualProfile.key,
    visualProfileLabelZh: visualProfile.labelZh,
  };
  plan.prompt = buildFoodImagePrompt(plan);
  return plan;
}

function buildFoodImagePrompt(input = {}) {
  const {
  foodNameZh,
  foodNameEn,
  category,
  cookingMethod,
  servingDescription,
  extraPrompt,
  } = input;
  const nameZh = clampText(foodNameZh || foodNameEn, 40) || "食物";
  const nameEn = clampText(foodNameEn, 40);
  const cat = clampText(category, 16);
  const cook = clampText(cookingMethod, 12);
  const serving = clampText(servingDescription, 24);
  const inferred = resolveFoodPhotoTemplate({ foodNameZh: nameZh, foodNameEn: nameEn, category: cat });
  const visualProfile = resolveVisualProfile({ nameZh, nameEn, category: { nameZh: cat }, defaultCookingMethod: cook, visualProfileKey: input.visualProfileKey }, input.visualProfileKey);
  const cookHint = clampText(input.cookingHint, 120) || COOKING_HINTS[cook] || (cook ? `${cook}烹饪` : visualProfile.promptHint || inferred.defaultCooking);
  const subject = clampText(input.subject, 120) || inferred.subject;
  const negative = clampText(input.negativePrompt, 160) || inferred.negative;
  const extra = clampText(extraPrompt, 120);

  const parts = [
    `真实可食用健康食物摄影，主体：${nameZh}`,
    nameEn ? `英文：${nameEn}` : "",
    cat ? `分类：${cat}` : "",
    subject,
    cookHint || "",
    serving ? `份量：${serving}` : "",
    "北欧自然光，浅米白桌面，浅木色餐具，低饱和，主体居中，轻微虚化，4:3横构图",
    `仅此食物，无人手无文字无包装无水印无插画无3D。${negative}`,
    extra,
  ].filter(Boolean);

  let prompt = parts.join("。").replace(/。+/g, "。");
  if (!prompt.endsWith("。")) prompt += "。";
  if (prompt.length > MAX_PROMPT_CHARS) {
    prompt = `${prompt.slice(0, MAX_PROMPT_CHARS - 1)}。`;
  }
  return prompt;
}

module.exports = {
  MAX_PROMPT_CHARS,
  COOKING_HINTS,
  PHOTO_TEMPLATES,
  resolveFoodPhotoTemplate,
  buildFoodImagePromptPlan,
  buildFoodImagePrompt,
  clampText,
};
