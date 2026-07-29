const dailyTipTypes = new Set(["nutrition_tip", "food_function", "food_knowledge"]);
const unsafeDailyTipWording = /诊断|治疗|处方|药物|用药|孕期|怀孕|哺乳|厌食|暴食|替代医疗/i;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const DAILY_TIP_SYSTEM_PROMPT = `你是 Nordic Nutri 的日常营养内容编辑。只依据 nutritionContext 生成一条简洁、准确、适合普通成年人阅读的中文小建议。tipType 决定内容类型：nutrition_tip 是结合当天营养情况的日常建议，food_function 是食材的营养功能介绍，food_knowledge 是帮助用户理解健康饮食和食品营销话术的小知识。不要做品牌广告，不要声称食物可以治病或保证减重。不得诊断、治疗、开药，不能对疾病、药物、孕产、未成年人或进食障碍给出个体化建议。只输出 JSON，不要 Markdown 或额外解释：{"type":"nutrition_tip|food_function|food_knowledge","headline":"不超过32个字符","content":"不超过120个字符","food":null或{"name":"食物名","proteinG":数字}}。只有 nutrition_tip 且明确推荐一种可作为加餐的食物时才填写 food，否则为 null。`;

const fallbackTips = {
  nutrition_tip: [
    { type: "nutrition_tip", headline: "下一餐加一份深色蔬菜", content: "西兰花、菠菜等能帮助补充膳食纤维；搭配蛋白质和适量主食更均衡。", food: null },
    { type: "nutrition_tip", headline: "把蛋白质分到每一餐", content: "每餐安排鸡蛋、鱼、豆腐或奶制品中的一种，比晚餐一次性补足更容易坚持。", food: null },
  ],
  food_function: [
    { type: "food_function", headline: "燕麦也可以做正餐", content: "燕麦含有膳食纤维，搭配酸奶、水果和坚果能提升早餐的饱腹感与多样性。", food: null },
    { type: "food_function", headline: "鸡蛋提供优质蛋白", content: "鸡蛋适合搭配蔬菜和主食，蛋黄还含有胆碱；日常饮食可以关注整体搭配。", food: null },
  ],
  food_knowledge: [
    { type: "food_knowledge", headline: "看懂食品宣传的小技巧", content: "看到“高蛋白”或“轻食”时，记得同时查看配料表、蛋白质含量和每份能量。", food: null },
    { type: "food_knowledge", headline: "“无糖”不等于低能量", content: "无糖产品仍可能含有较多淀粉、脂肪或代糖；比较营养成分表比只看包装更可靠。", food: null },
  ],
};

function dailyTipError(code = "DAILY_TIP_RETRYABLE") {
  return new Error(code);
}

function boundedText(value, maxLength) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= maxLength ? text : null;
}

function normalizeFood(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const name = boundedText(value.name, 24);
  const proteinG = Number(value.proteinG);
  if (!name || !Number.isFinite(proteinG) || proteinG < 0 || proteinG > 100) return null;
  return { name, proteinG: Math.round(proteinG * 10) / 10 };
}

function validateDailyTip(payload) {
  let value = payload;
  try {
    if (typeof value === "string") value = JSON.parse(value);
  } catch {
    throw dailyTipError();
  }
  if (!value || typeof value !== "object" || Array.isArray(value) || !dailyTipTypes.has(value.type)) {
    throw dailyTipError();
  }
  const headline = boundedText(value.headline, 32);
  const content = boundedText(value.content, 120);
  if (!headline || !content || unsafeDailyTipWording.test(`${headline}\n${content}`)) {
    throw dailyTipError();
  }
  return { type: value.type, headline, content, food: normalizeFood(value.food) };
}

function pickFallback(type, random) {
  const items = fallbackTips[type];
  const index = Math.min(items.length - 1, Math.floor(random() * items.length));
  return { ...items[index] };
}

function createDeepseekDailyTipCompletion({ apiKey, model, fetchImpl = globalThis.fetch } = {}) {
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("DeepSeek configuration is incomplete");
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable");
  const selectedModel = typeof model === "string" && model.trim() ? model.trim() : "deepseek-v4-flash";
  return async ({ type, context }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetchImpl("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          thinking: { type: "disabled" },
          response_format: { type: "json_object" },
          temperature: 0.8,
          max_tokens: 220,
          messages: [
            { role: "system", content: DAILY_TIP_SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify({ tipType: type, nutritionContext: context }) },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw dailyTipError();
      const data = await response.json();
      return data?.choices?.[0]?.message?.content;
    } catch (error) {
      if (error?.message === "DAILY_TIP_RETRYABLE") throw error;
      throw dailyTipError();
    } finally {
      clearTimeout(timer);
    }
  };
}

function createDailyTipService({ apiKey, model, requestCompletion, contextProvider, random = Math.random } = {}) {
  const selectedModel = typeof model === "string" && model.trim() ? model.trim() : "deepseek-v4-flash";
  const complete = requestCompletion ?? (apiKey ? createDeepseekDailyTipCompletion({ apiKey, model: selectedModel }) : null);
  return async ({ date, context } = {}) => {
    if (typeof date !== "string" || !datePattern.test(date)) throw dailyTipError("DAILY_TIP_INPUT_INVALID");
    const nutritionContext = context ?? (typeof contextProvider === "function" ? await contextProvider(date) : {});
    const types = ["nutrition_tip", "food_function", "food_knowledge"];
    const type = types[Math.min(types.length - 1, Math.floor(random() * types.length))];
    if (!complete) return { ...pickFallback(type, random), source: "rule_v2", model: null };
    try {
      const tip = validateDailyTip(await complete({ date, type, context: nutritionContext }));
      return { ...tip, source: "deepseek", model: selectedModel };
    } catch {
      return { ...pickFallback(type, random), source: "rule_v2", model: null };
    }
  };
}

module.exports = { DAILY_TIP_SYSTEM_PROMPT, createDailyTipService, createDeepseekDailyTipCompletion, validateDailyTip };
