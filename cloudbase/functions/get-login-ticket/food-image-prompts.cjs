// food-image-prompts.cjs
// Centralized Hunyuan food-photo prompts. Official API limit: 500 characters.
// Assembly: identity → class → subject → state → correction → negatives → serving → style
// Over budget: drop/shorten from the end (style first).

const MAX_PROMPT_CHARS = 500;
const { resolveVisualProfile } = require("./food-image-visual-profile.cjs");
const {
  FOOD_VISUAL_TYPES,
  FOOD_VISUAL_TYPE_OPTIONS,
  resolveFoodVisualType,
  resolveFlavor,
  resolveFlavorColor,
  resolveFoodProcessingLevel,
  resolveFoodProcessingLabel,
  buildBasePhotographyPrompt,
  buildPromptByVisualType,
} = require("./food-image-visual-type.cjs");

const STYLE_SLOT = "北欧自然光，浅米白桌面，浅木色餐具，低饱和，主体居中，轻微虚化，4:3";
// This compact direction is deliberately placed before all food-specific slots.
// Hunyuan has a 500-character prompt limit, so the full style slot may be
// trimmed but the photographic language must remain stable across every form.
const NORDIC_ART_DIRECTION_SLOT = "北欧自然食物摄影：柔和侧向窗光，暖白或浅米白桌面，少量浅木道具，低饱和留白；主体居中，3/4轻斜俯视，50mm自然透视，轻景深，4:3横构图；避免顶视平铺、强逆光、硬闪、广角畸变、广告棚拍";

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

const REJECT_REASON_CODES = Object.freeze({
  wrong_identity: { labelZh: "认错食材", fragment: "必须严格符合该食材形态，勿生成其他品类" },
  wrong_doneness: { labelZh: "生熟错误", fragment: "严格按指定生熟状态，勿混用生鲜与熟制特征" },
  extra_foods: { labelZh: "多余配菜/拼盘", fragment: "仅单一主体，勿增加配菜拼盘或其他食物" },
  sauce_or_seasoning: { labelZh: "酱汁/调味过重", fragment: "无浓酱无油炸无多余调味" },
  style_off: { labelZh: "风格不符", fragment: "保持北欧自然光与浅色桌面，低饱和" },
  other: { labelZh: "其他", fragment: "" },
});

/** Broad taxonomy codes → template id (name-specific templates still win first). */
const CATEGORY_CODE_TEMPLATE = Object.freeze({
  meat: "meat_poultry",
  seafood: "seafood",
  egg: "egg_dairy",
  dairy: "egg_dairy",
  soy: "plant_protein",
  grain: "grain_bakery",
  vegetable: "vegetable",
  fruit: "fruit",
  nut: "nuts_oil",
  nuts: "nuts_oil",
  oil: "nuts_oil",
});

const PHOTO_TEMPLATES = [
  {
    id: "shellfish_gastropod",
    specific: true,
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
    specific: true,
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
    specific: true,
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
    specific: true,
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
    cookedSubject: "水煮或清淡熟制蛋类/乳制品，形态准确，无包装无甜品装饰",
    rawSubject: "生鲜蛋类或未加工乳制品主体，形态准确、无包装",
    defaultCooking: "按食材本身呈现，保持自然颜色与质地",
    negative: "勿增加肉类、面包、麦片、水果、甜品、文字或包装",
  },
  {
    id: "meat_poultry",
    match: /肉禽|鸡|鸭|鹅|牛肉|猪肉|羊肉|火鸡|鹿肉|兔肉/,
    subject: "可食用的单一肉类主体，切面与肌理自然可见，白盘居中",
    cookedSubject: "清淡熟制的单一肉类，切面熟透不透明，无焦黑无浓酱，白盘居中",
    rawSubject: "生鲜未烹调肉类原料，自然色泽与肌理可见，无熟制焦痕无酱汁",
    defaultCooking: "按食材本身呈现；未指定做法时保持原料或清淡熟制",
    negative: "勿增加米饭、蔬菜、酱汁、烧烤焦痕、拼盘或其他肉类",
  },
  {
    id: "seafood",
    match: /鱼虾海鲜|鱼|虾|蟹|贝|蛤|牡蛎|三文鱼|金枪鱼|鳕|鲑|海鲜/,
    subject: "可食用的单一鱼类或海鲜主体，新鲜干净，纹理真实，白盘居中",
    cookedSubject: "清淡熟制的单一鱼类或海鲜，肉质不透明，无寿司拼盘无浓酱",
    rawSubject: "生鲜未烹调鱼类或海鲜原料，自然湿润纹理，无熟制焦痕无酱汁",
    defaultCooking: "按食材本身呈现；未指定做法时保持新鲜或清淡熟制",
    negative: "勿增加寿司、意面、薯条、沙拉、柠檬片、酱汁或其他海鲜",
  },
  {
    id: "plant_protein",
    match: /豆类|植物蛋白|豆腐|黄豆|鹰嘴豆|扁豆|豆浆|tempeh|豆制品/i,
    subject: "单一豆类或植物蛋白主体，形态准确、可清楚辨识",
    cookedSubject: "清淡熟制的豆制品或植物蛋白，形态清楚，无肉类质感",
    rawSubject: "生鲜或未烹调豆类/植物蛋白原料，形态准确",
    defaultCooking: "按食材本身呈现，未指定做法时为原料或清淡熟制",
    negative: "勿增加肉类、谷物主食、蔬菜拼盘、酱汁、文字或包装",
  },
  {
    id: "grain_bakery",
    match: /谷物|烘焙|燕麦|米|麦|面包|意面|藜麦|荞麦|玉米/i,
    subject: "单一谷物、主食或基础烘焙食材，形态与颗粒质感准确",
    defaultCooking: "按食材本身呈现，避免混入其他菜品",
    negative: "勿增加肉类、蔬菜、果酱、黄油、饮料、文字或包装",
  },
  {
    id: "vegetable",
    match: /蔬菜|番茄|西兰花|菠菜|蘑菇|土豆|南瓜|胡萝卜|洋葱|叶菜|根茎/i,
    subject: "单一蔬菜主体，保留真实颜色、表皮和切面特征",
    cookedSubject: "轻焯或清淡熟制的单一蔬菜，保留本色，不成菜肴拼盘",
    rawSubject: "新鲜未烹调单一蔬菜，保留真实颜色与表皮",
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

const GENERAL_TEMPLATE = {
  id: "general_food",
  subject: "单一可食用食材主体，形态准确、清楚可辨",
  defaultCooking: "按食材本身呈现，不制作成复杂菜肴",
  negative: "勿增加其他食物、文字、包装、水印、插画或3D",
};

function clampText(value, max) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  return text.length <= max ? text : text.slice(0, max);
}

function normalizeReasonCode(value) {
  const key = String(value || "").trim().toLowerCase();
  return REJECT_REASON_CODES[key] ? key : "";
}

function formatRejectCorrection(reasonCode, freeText) {
  const code = normalizeReasonCode(reasonCode);
  const fragment = code ? (REJECT_REASON_CODES[code].fragment || "") : "";
  const note = clampText(freeText, 180);
  return [fragment, note].filter(Boolean).join("；");
}

function templateById(id) {
  return PHOTO_TEMPLATES.find((template) => template.id === id) || null;
}

function resolveCategoryCodeTemplate(categoryCode) {
  const raw = String(categoryCode || "").trim().toLowerCase();
  if (!raw) return null;
  const root = raw.split(".")[0];
  const templateId = CATEGORY_CODE_TEMPLATE[raw] || CATEGORY_CODE_TEMPLATE[root];
  return templateId ? templateById(templateId) : null;
}

/**
 * Name-specific templates win; then category code; then broad name/category regex.
 */
function resolveFoodPhotoTemplate({ foodNameZh, foodNameEn, category, categoryCode } = {}) {
  const nameText = `${foodNameZh || ""} ${foodNameEn || ""}`;
  const specific = PHOTO_TEMPLATES.find((template) => template.specific && template.match.test(nameText));
  if (specific) return specific;

  const byCode = resolveCategoryCodeTemplate(categoryCode);
  if (byCode) return byCode;

  const text = `${nameText} ${category || ""}`;
  return PHOTO_TEMPLATES.find((template) => template.match.test(text)) || GENERAL_TEMPLATE;
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
    // Mutex: never append dry-heat / grilled cooking hints under raw.
    const rawSafeCook = /烤|煎|香煎|烘焙/.test(cookingMethod || "") ? "" : cookingHint;
    return {
      subject: template.rawSubject || template.subject,
      cookingHint: [visualProfile.promptHint, rawSafeCook].filter(Boolean).join("；"),
    };
  }
  if (state === "fresh" || state === "dry") {
    return {
      subject: template.rawSubject || template.subject,
      cookingHint: visualProfile.promptHint || cookingHint || template.defaultCooking,
    };
  }
  return {
    subject: template.subject,
    cookingHint: cookingHint || visualProfile?.promptHint || template.defaultCooking,
  };
}

function joinSlots(slots) {
  let prompt = slots.filter(Boolean).join("。").replace(/。+/g, "。");
  if (prompt && !prompt.endsWith("。")) prompt += "。";
  return prompt;
}

/**
 * Drop or shorten lowest-priority slots until prompt fits MAX_PROMPT_CHARS.
 * Priority (drop first): style → serving → negatives → correction → subject → state → class
 * Identity is never dropped.
 */
function assemblePromptSlots(slotMap, { forceOverflow = false } = {}) {
  const order = ["identity", "artDirection", "class", "subject", "state", "correction", "negatives", "serving", "style"];
  const dropOrder = ["style", "serving", "negatives", "correction", "subject", "state", "class"];
  const values = { ...slotMap };
  const trimmedSlots = [];

  const render = () => joinSlots(order.map((key) => values[key]).filter(Boolean));
  let prompt = render();

  // Test hook: pretend style pushes us over so trim logic is exercised even if under budget.
  if (forceOverflow && prompt.length <= MAX_PROMPT_CHARS && values.style) {
    values.style = `${values.style}，${"额外风格约束文字。".repeat(40)}`;
    prompt = render();
  }

  while (prompt.length > MAX_PROMPT_CHARS) {
    let progressed = false;
    for (const key of dropOrder) {
      if (!values[key]) continue;
      if (key === "negatives" || key === "correction" || key === "subject" || key === "state") {
        const next = clampText(values[key], Math.max(24, Math.floor(values[key].length * 0.6)));
        if (next !== values[key] && next.length < values[key].length) {
          values[key] = next;
          if (!trimmedSlots.includes(key)) trimmedSlots.push(key);
          progressed = true;
          break;
        }
      }
      delete values[key];
      if (!trimmedSlots.includes(key)) trimmedSlots.push(key);
      progressed = true;
      break;
    }
    prompt = render();
    if (!progressed) {
      prompt = `${prompt.slice(0, MAX_PROMPT_CHARS - 1)}。`;
      break;
    }
  }

  return { prompt, trimmedSlots, slots: values };
}

function buildFoodImagePromptPlan(input = {}) {
  const nameZh = clampText(input.foodNameZh || input.foodNameEn, 40) || "食物";
  const nameEn = clampText(input.foodNameEn, 40);
  const cat = clampText(input.category, 16);
  const categoryCode = clampText(input.categoryCode, 32);
  const cook = clampText(input.cookingMethod, 12);
  const serving = clampText(input.servingDescription, 24);
  const imageSubjectZh = clampText(input.imageSubjectZh, 180);
  const reasonCode = normalizeReasonCode(input.reasonCode);
  const retryReason = clampText(input.retryReason, 180);
  const correction = formatRejectCorrection(reasonCode, [input.extraPrompt, retryReason].filter(Boolean).join("；"));
  const visualResolution = resolveFoodVisualType({
    nameZh,
    nameEn,
    category: input.category ? { nameZh: input.category, code: categoryCode } : { code: categoryCode },
    tags: input.tags,
    foodForm: input.foodForm,
    visualType: input.visualType,
  });
  const visualTemplate = buildPromptByVisualType({ nameZh, nameEn }, visualResolution.visualType);
  const template = resolveFoodPhotoTemplate({
    foodNameZh: nameZh,
    foodNameEn: nameEn,
    category: cat,
    categoryCode,
  });
  const visualProfile = resolveVisualProfile({
    nameZh,
    nameEn,
    category: input.category ? { nameZh: input.category, code: categoryCode } : (categoryCode ? { code: categoryCode } : null),
    defaultCookingMethod: cook,
    visualProfileKey: input.visualProfileKey,
  }, input.visualProfileKey);
  const presentation = resolveVisualPresentation(template, visualProfile, cook);
  const legacySpecializedTypes = new Set(["raw_meat", "shellfish", "egg", "unknown"]);
  const useVisualTemplate = !legacySpecializedTypes.has(visualResolution.visualType);
  // A verified per-food subject remains the strongest visual correction.  For
  // Visual-form templates beat every broad category/name template. The few
  // legacy-specialized types keep their verified cooked/raw logic.
  const subject = clampText(input.subject, 180) || imageSubjectZh || (useVisualTemplate ? visualTemplate.subject : presentation.subject);
  const cookingHint = clampText(input.cookingHint, 150) || presentation.cookingHint;
  const negative = clampText(input.negativePrompt, 260) || (useVisualTemplate
    ? visualTemplate.negativePrompt
    : (template.negative || visualTemplate.negativePrompt || GENERAL_TEMPLATE.negative));
  const categoryLabel = clampText(
    useVisualTemplate
      ? FOOD_VISUAL_TYPE_OPTIONS[visualResolution.visualType]
      : (template.categoryLabel || cat),
    32,
  );

  const assembled = assemblePromptSlots({
    identity: [`真实可食用健康食物摄影，主体：${nameZh}`, nameEn ? `英文：${nameEn}` : ""].filter(Boolean).join("，"),
    artDirection: NORDIC_ART_DIRECTION_SLOT,
    class: categoryLabel ? `视觉分类：${categoryLabel}` : "",
    subject,
    state: cookingHint || "",
    correction: correction ? `根据审核反馈修正：${clampText(correction, 140)}` : "",
    // Hunyuan's current Node SDK invocation only accepts a positive `prompt`.
    // Keep the independently-auditable negative list, then render it as an
    // explicit prohibition in that supported prompt field.
    negatives: `仅此食物，无人手无文字无包装无水印无插画无3D。禁止生成：${negative}`,
    serving: serving ? `份量：${serving}` : "",
    style: buildBasePhotographyPrompt(),
  }, { forceOverflow: Boolean(input.forceOverflow) });

  return {
    template: useVisualTemplate ? visualResolution.visualType : template.id,
    templateName: useVisualTemplate ? visualTemplate.templateName : template.id,
    visualType: visualResolution.visualType,
    visualTypeLabelZh: FOOD_VISUAL_TYPE_OPTIONS[visualResolution.visualType],
    decisionSource: visualResolution.source,
    matchedKeywords: visualResolution.matchedKeywords,
    ignoredKeywords: visualResolution.ignoredKeywords || [],
    excludedVisualTypes: visualResolution.excludedVisualTypes || [],
    rulePriority: visualResolution.rulePriority ?? null,
    beverageSubtype: visualResolution.beverageSubtype || visualTemplate.beverageSubtype || null,
    flavor: resolveFlavor({ nameZh, nameEn }).flavor,
    flavorColor: resolveFlavorColor({ nameZh, nameEn }),
    foodProcessingLevel: resolveFoodProcessingLevel({ nameZh, nameEn, category: input.category ? { nameZh: input.category, code: categoryCode } : { code: categoryCode }, tags: input.tags, foodForm: input.foodForm, visualType: input.visualType }),
    foodProcessingLabel: resolveFoodProcessingLabel({ nameZh, nameEn, category: input.category ? { nameZh: input.category, code: categoryCode } : { code: categoryCode }, tags: input.tags, foodForm: input.foodForm, visualType: input.visualType }),
    foodNameZh: nameZh,
    foodNameEn: nameEn,
    category: cat,
    categoryCode: categoryCode || null,
    subject,
    cookingHint,
    imageSubjectZh: imageSubjectZh || null,
    servingDescription: serving,
    negativePrompt: negative,
    extraPrompt: correction || null,
    retryReason: retryReason || null,
    reasonCode: reasonCode || null,
    visualProfileKey: visualProfile.key,
    visualProfileLabelZh: visualProfile.labelZh,
    trimmedSlots: assembled.trimmedSlots,
    positivePrompt: assembled.prompt,
    prompt: assembled.prompt,
  };
}

function buildFoodImagePrompt(input = {}) {
  if (input && typeof input.prompt === "string" && input.prompt && input.template) {
    // Re-compose from plan fields so callers can mutate slots; fall through if incomplete.
  }
  const plan = buildFoodImagePromptPlan(input);
  return plan.prompt;
}

module.exports = {
  MAX_PROMPT_CHARS,
  COOKING_HINTS,
  PHOTO_TEMPLATES,
  REJECT_REASON_CODES,
  STYLE_SLOT,
  NORDIC_ART_DIRECTION_SLOT,
  CATEGORY_CODE_TEMPLATE,
  FOOD_VISUAL_TYPES,
  FOOD_VISUAL_TYPE_OPTIONS,
  resolveFoodVisualType,
  resolveFlavor,
  resolveFlavorColor,
  buildBasePhotographyPrompt,
  buildPromptByVisualType,
  resolveFoodPhotoTemplate,
  buildFoodImagePromptPlan,
  buildFoodImagePrompt,
  formatRejectCorrection,
  normalizeReasonCode,
  clampText,
};
