// food-image-prompts.cjs
// Centralized Hunyuan food-photo prompts. Official API limit: 500 characters.

const MAX_PROMPT_CHARS = 500;

const COOKING_HINTS = {
  水煮: "水煮，无焦痕无煎烤无酱汁无油脂",
  香煎: "浅金表面，不可焦黑，少油",
  清蒸: "清蒸本色，无煎烤痕迹",
  生鲜: "新鲜食材本色，勿生成沙拉果汁甜品",
  烘焙: "准确呈现烘焙质感，勿混甜面包与全麦",
};

function clampText(value, max) {
  const text = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  return text.length <= max ? text : text.slice(0, max);
}

/**
 * Build a compact Nordic food-photography prompt under the 500-char API limit.
 */
function buildFoodImagePrompt({
  foodNameZh,
  foodNameEn,
  category,
  cookingMethod,
  servingDescription,
  extraPrompt,
} = {}) {
  const nameZh = clampText(foodNameZh || foodNameEn, 40) || "食物";
  const nameEn = clampText(foodNameEn, 40);
  const cat = clampText(category, 16);
  const cook = clampText(cookingMethod, 12);
  const serving = clampText(servingDescription, 24);
  const cookHint = COOKING_HINTS[cook] || (cook ? `${cook}烹饪` : "");
  const extra = clampText(extraPrompt, 80);

  const parts = [
    `真实可食用健康食物摄影，主体：${nameZh}`,
    nameEn ? `英文：${nameEn}` : "",
    cat ? `分类：${cat}` : "",
    cookHint || "",
    serving ? `份量：${serving}` : "",
    "北欧自然光，浅米白桌面，浅木色餐具，低饱和，主体居中，轻微虚化，4:3横构图",
    "仅此食物，无人手无文字无包装无水印无插画无3D，勿增主食配菜饮料",
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
  buildFoodImagePrompt,
  clampText,
};
