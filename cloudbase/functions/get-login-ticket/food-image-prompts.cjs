// food-image-prompts.cjs
// Centralized Hunyuan food-photo prompts. Official API limit: 500 characters.

const MAX_PROMPT_CHARS = 500;
const { resolveVisualProfile } = require("./food-image-visual-profile.cjs");

const COOKING_HINTS = {
  水煮: "水煮熟制，无焦痕无煎烤无酱汁无油脂",
  香煎: "浅金表面，不可焦黑，少油",
  烤: "轻烤熟制，表面自然微焦但不可焦黑，无浓酱",
  清蒸: "清蒸本色，无煎烤痕迹",
  蒸: "清蒸熟制，保留食材本色，无煎烤痕迹",
  生: "生鲜未烹调状态，保留自然湿润纹理",
  生鲜: "新鲜食材本色，勿生成沙拉果汁甜品",
  烘焙: "准确呈现烘焙质感，勿混甜面包与全麦",
};

const PHOTO_TEMPLATES = [
  {
    id: "shellfish_gastropod",
    match: /海螺|田螺|鲍鱼|螺肉|whelk|conch|abalone|snail/i,
    categoryLabel: "贝类，不是鱼类",
    subject: "单一腹足类贝类主体，螺旋外壳与可食用螺肉的形态准确、清楚可辨",
    cookedSubject: "已蒸熟的腹足类贝类：壳口打开，熟螺肉完整露出或从壳中取出摆放；肉质灰白至米白、不透明、略微收缩，有明确熟制纹理",
    rawSubject: "生鲜腹足类贝类：保留完整螺旋壳和自然湿润质地，不出现熟制收缩、焦痕或酱汁",
    defaultCooking: "按食材本身呈现；未指定做法时保持生鲜或清淡熟制",
    negative: "勿生成鱼类、闭合海螺作为唯一主体、活体触须、透明湿润生肉、其他海鲜、寿司、沙拉、柠檬片、酱汁或包装",
  },
  {
    id: "shellfish_bivalve",
    match: /牡蛎|生蚝|蚝|蛤|扇贝|贻贝|青口|clam|oyster|mussel|scallop/i,
    categoryLabel: "贝类，不是鱼类",
    subject: "单一双壳贝类主体，贝壳和可食用贝肉形态准确、清楚可辨",
    cookedSubject: "已清淡熟制的双壳贝类：贝壳打开，熟贝肉露出；肉质不透明、轻微收缩，不出现透明生肉或活体状态",
    rawSubject: "生鲜双壳贝类：保留自然贝壳与湿润鲜活质地，不出现熟制收缩、焦痕或酱汁",
    defaultCooking: "按食材本身呈现；未指定做法时保持生鲜或清淡熟制",
    negative: "勿生成鱼类、虾蟹、闭合贝壳作为唯一主体、寿司、沙拉、柠檬片、酱汁或包装",
  },
  {
    id: "crustacean",
    match: /虾|蟹|龙虾|shrimp|prawn|crab|lobster/i,
    categoryLabel: "虾蟹，不是鱼类",
    subject: "单一甲壳类主体，甲壳、足部与可食用形态准确、清楚可辨",
    cookedSubject: "已清淡熟制的甲壳类，甲壳呈自然熟制色泽，肉质不透明，不出现生鲜透明肉或浓酱",
    rawSubject: "生鲜甲壳类，保留自然壳色和生鲜质地，不出现熟制变色、焦痕或酱汁",
    defaultCooking: "按食材本身呈现；未指定做法时保持生鲜或清淡熟制",
    negative: "勿生成鱼类、贝类、寿司、沙拉、柠檬片、酱汁或包装",
  },
  {
    id: "cephalopod",
    match: /鱿鱼|章鱼|墨鱼|乌贼|squid|octopus|cuttlefish/i,
    categoryLabel: "头足类，不是鱼类",
    subject: "单一头足类主体，触腕、身体和可食用形态准确、清楚可辨",
    cookedSubject: "已清淡熟制的头足类，肉质不透明、略微收缩，保留自然结构，不出现生鲜透明质地或浓酱",
    rawSubject: "生鲜头足类，保留自然湿润质地与完整结构，不出现熟制收缩、焦痕或酱汁",
    defaultCooking: "按食材本身呈现；未指定做法时保持生鲜或清淡熟制",
    negative: "勿生成鱼类、贝类、虾蟹、寿司、沙拉、柠檬片、酱汁或包装",
  },
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

function resolveVisualPresentation(template, visualProfile, cookingMethod) {
  const state = visualProfile?.key || "standard";
  const cookingHint = COOKING_HINTS[cookingMethod] || "";
  if (state === "cooked_plain" || state === "cooked_grilled") {
    return {
      subject: template.cookedSubject || template.subject,
      cookingHint: [visualProfile.promptHint, cookingHint].filter(Boolean).join("；"),
    };
  }
  if (state === "raw") {
    return {
      subject: template.rawSubject || template.subject,
      cookingHint: [visualProfile.promptHint, cookingHint].filter(Boolean).join("；"),
    };
  }
  return {
    subject: template.subject,
    cookingHint: cookingHint || visualProfile?.promptHint || template.defaultCooking,
  };
}

function buildFoodImagePromptPlan(input = {}) {
  const nameZh = clampText(input.foodNameZh || input.foodNameEn, 40) || "食物";
  const nameEn = clampText(input.foodNameEn, 40);
  const cat = clampText(input.category, 16);
  const cook = clampText(input.cookingMethod, 12);
  const serving = clampText(input.servingDescription, 24);
  const imageSubjectZh = clampText(input.imageSubjectZh, 180);
  const retryReason = clampText(input.retryReason, 180);
  const extra = clampText([
    input.extraPrompt,
    retryReason,
  ].filter(Boolean).join("；"), 180);
  const template = resolveFoodPhotoTemplate({ foodNameZh: nameZh, foodNameEn: nameEn, category: cat });
  const visualProfile = resolveVisualProfile({
    nameZh,
    nameEn,
    category: input.category ? { nameZh: input.category } : null,
    defaultCookingMethod: cook,
    visualProfileKey: input.visualProfileKey,
  }, input.visualProfileKey);
  const presentation = resolveVisualPresentation(template, visualProfile, cook);
  const plan = {
    template: template.id,
    foodNameZh: nameZh,
    foodNameEn: nameEn,
    category: cat,
    subject: imageSubjectZh || presentation.subject,
    cookingHint: presentation.cookingHint,
    imageSubjectZh: imageSubjectZh || null,
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
    imageSubjectZh,
  } = input;
  const nameZh = clampText(foodNameZh || foodNameEn, 40) || "食物";
  const nameEn = clampText(foodNameEn, 40);
  const cat = clampText(category, 16);
  const cook = clampText(cookingMethod, 12);
  const serving = clampText(servingDescription, 24);
  const inferred = resolveFoodPhotoTemplate({ foodNameZh: nameZh, foodNameEn: nameEn, category: cat });
  const visualProfile = resolveVisualProfile({ nameZh, nameEn, category: { nameZh: cat }, defaultCookingMethod: cook, visualProfileKey: input.visualProfileKey }, input.visualProfileKey);
  const presentation = resolveVisualPresentation(inferred, visualProfile, cook);
  const cookHint = clampText(input.cookingHint, 150) || presentation.cookingHint;
  const subject = clampText(input.subject || imageSubjectZh, 180) || presentation.subject;
  const negative = clampText(input.negativePrompt, 180) || inferred.negative;
  const extra = clampText(extraPrompt, 140);
  const categoryLabel = clampText(inferred.categoryLabel || cat, 32);

  const parts = [
    `真实可食用健康食物摄影，主体：${nameZh}`,
    nameEn ? `英文：${nameEn}` : "",
    categoryLabel ? `视觉分类：${categoryLabel}` : "",
    subject,
    cookHint || "",
    extra ? `根据审核反馈修正：${extra}` : "",
    serving ? `份量：${serving}` : "",
    "北欧自然光，浅米白桌面，浅木色餐具，低饱和，主体居中，轻微虚化，4:3横构图",
    `仅此食物，无人手无文字无包装无水印无插画无3D。${negative}`,
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
