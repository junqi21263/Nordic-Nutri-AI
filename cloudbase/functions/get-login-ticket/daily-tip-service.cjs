const dailyTipTypes = new Set(["nutrition_tip", "food_function", "food_knowledge"]);
const unsafeDailyTipWording = /诊断|治疗|处方|药物|吃药|用药|孕期|怀孕|哺乳|厌食|暴食|替代医疗/i;
const genericCoachQuickPromptWording = /怎么吃更健康|吃什么比较好|饮食怎么安排|怎么搭配更好/i;
const forbiddenPresentationWording = /```|[`*#]|^\s*(?:回复|答复|回答|建议|说明)\s*[:：]/m;
const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const DAILY_TIP_SYSTEM_PROMPT = `你是 Nordic Nutri 的日常营养内容编辑。只依据 nutritionContext 为普通成年人生成一条当天可执行的中文营养建议。必须尊重 preferences 中的饮食模式、忌口与每日餐次：推荐食材不得与 foodAvoidances / foodAvoidanceLabels 冲突，并贴合 dietaryPattern 与 mealsPerDay。先从当天记录中最需要优先补足的一个方向（蛋白质、能量、碳水、脂肪、膳食纤维、规律性或食物多样性）开始；信息不足时，只给保守的通用搭配，不编造已记录的饮食、训练或健康状况。避免泛泛而谈：标题要给出明确决策，正文必须给出具体食物或搭配方式，并说明适合的餐次、份量范围、替换选项或搭配理由中的至少两项。tipType 规则：nutrition_tip 要围绕当天缺口给出下一餐或加餐的实用选择；food_function 要说明一种常见食物的营养特点及日常搭配方式，不夸大单一食物作用；food_knowledge 要解释一个食品标签、营销话术或选购误区，并给出可检查的营养成分表或配料表要点。不要做品牌广告，不要声称食物可以治病、保证减重或替代医疗。不得诊断、治疗、开药，不能对疾病、药物、孕产、未成年人或进食障碍给出个体化建议。输出约束：只输出 JSON，不要 Markdown、编号、标题符号或额外解释；禁止使用双星号加粗、星号、反引号或以“回复：”“答复：”“回答：”“建议：”“说明：”开头。字段值必须是可直接展示的纯文本：{"type":"nutrition_tip|food_function|food_knowledge","headline":"不超过32个字符","content":"不超过120个字符","reason":"不超过30个字符，说明推荐依据","food":null或{"name":"食物名","proteinG":数字}}。reason 只解释当前推荐为什么值得做，不能使用空泛口号。只有 nutrition_tip 且正文明确推荐一种可作为加餐的食物时才填写 food，否则为 null。`;
const COACH_QUICK_PROMPT_SYSTEM_PROMPT = `你是 Nordic Nutri 的营养教练。只依据 nutritionContext 生成一条用户可一键发送的中文营养问题。先识别当前时间段、下一餐场景、当天营养缺口、目标、饮食偏好/忌口和已记录餐次中实际可用的信息；只选择其中一个最值得追问的方向，不要编造不存在的训练、疾病或饮食偏好。若存在忌口，问题可自然带上规避限制。问题必须自然、具体、可直接由教练给出食物搭配或记录建议：至少包含餐次/场景（如午餐、晚餐、加餐、外食）与营养目标/限制（如蛋白质、能量、碳水、增肌、饱腹）中的一个具体锚点。不要生成泛泛问题，例如“怎么吃更健康？”、“吃什么比较好？”、“饮食怎么安排？”，不要使用问候、说明、多个问题或行动指令。避免医疗、疾病、药物、孕产、未成年人和进食障碍内容；不要做诊断、治疗或保证效果。输出约束：只输出 JSON，不要 Markdown、标题符号或额外解释；禁止使用双星号加粗、星号、反引号或以“回复：”“答复：”“回答：”“建议：”“说明：”开头。问题字段必须是可直接发送的纯文本，只包含一个问题并以中文问号结尾：{"prompt":"不超过28个字符、以中文问号结尾的问题"}。`;

const fallbackTips = {
  nutrition_tip: [
    { type: "nutrition_tip", headline: "下一餐加一份深色蔬菜", content: "西兰花、菠菜等能帮助补充膳食纤维；搭配蛋白质和适量主食更均衡。", reason: "帮助补足当天的膳食纤维。", food: null },
    { type: "nutrition_tip", headline: "把蛋白质分到每一餐", content: "每餐安排鸡蛋、鱼、豆腐或奶制品中的一种，比晚餐一次性补足更容易坚持。", reason: "让蛋白摄入更均匀稳定。", food: null },
  ],
  food_function: [
    { type: "food_function", headline: "燕麦也可以做正餐", content: "燕麦含有膳食纤维，搭配酸奶、水果和坚果能提升早餐的饱腹感与多样性。", reason: "帮助提升早餐的饱腹感。", food: null },
    { type: "food_function", headline: "鸡蛋提供优质蛋白", content: "鸡蛋适合搭配蔬菜和主食，蛋黄还含有胆碱；日常饮食可以关注整体搭配。", reason: "让一餐蛋白来源更完整。", food: null },
  ],
  food_knowledge: [
    { type: "food_knowledge", headline: "看懂食品宣传的小技巧", content: "看到“高蛋白”或“轻食”时，记得同时查看配料表、蛋白质含量和每份能量。", reason: "避免只按包装宣传做选择。", food: null },
    { type: "food_knowledge", headline: "“无糖”不等于低能量", content: "无糖产品仍可能含有较多淀粉、脂肪或代糖；比较营养成分表比只看包装更可靠。", reason: "帮助你更准确判断能量。", food: null },
  ],
};
const fallbackCoachQuickPrompts = [
  "下一餐怎么补充蛋白质？",
  "下午训练后怎么加餐？",
  "外食时怎么搭配更均衡？",
  "今天剩余营养怎么安排？",
];

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
  const reason = boundedText(value.reason, 30);
  if (!headline || !content || !reason || unsafeDailyTipWording.test(`${headline}\n${content}\n${reason}`) || forbiddenPresentationWording.test(`${headline}\n${content}\n${reason}`)) {
    throw dailyTipError();
  }
  return { type: value.type, headline, content, reason, food: normalizeFood(value.food) };
}

function validateCoachQuickPrompt(payload) {
  let value = payload;
  try {
    if (typeof value === "string") value = JSON.parse(value);
  } catch {
    throw dailyTipError();
  }
  const prompt = boundedText(value?.prompt, 28);
  if (!prompt || !/[？?]$/.test(prompt) || unsafeDailyTipWording.test(prompt) || genericCoachQuickPromptWording.test(prompt) || forbiddenPresentationWording.test(prompt)) {
    throw dailyTipError();
  }
  return prompt.replace(/\?$/, "？");
}

function pickFallback(type, random) {
  const items = fallbackTips[type];
  const index = Math.min(items.length - 1, Math.floor(random() * items.length));
  return { ...items[index] };
}

function pickCoachQuickPrompt(random) {
  const index = Math.min(fallbackCoachQuickPrompts.length - 1, Math.floor(random() * fallbackCoachQuickPrompts.length));
  return fallbackCoachQuickPrompts[index];
}

const { extractContentAndUsage } = require("./model-usage.cjs");

function createDeepseekDailyTipCompletion({ apiKey, model, fetchImpl = globalThis.fetch } = {}) {
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("DeepSeek configuration is incomplete");
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable");
  const selectedModel = typeof model === "string" && model.trim() ? model.trim() : "deepseek-v4-flash";
  return async ({ type, context, purpose = "daily_tip" }) => {
    const isCoachQuickPrompt = purpose === "coach_quick_prompt";
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
          max_tokens: isCoachQuickPrompt ? 80 : 220,
          messages: [
            { role: "system", content: isCoachQuickPrompt ? COACH_QUICK_PROMPT_SYSTEM_PROMPT : DAILY_TIP_SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify(isCoachQuickPrompt ? { nutritionContext: context } : { tipType: type, nutritionContext: context }) },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw dailyTipError();
      const data = await response.json();
      const parsed = extractContentAndUsage(data);
      return { content: parsed.content, usage: parsed.usage };
    } catch (error) {
      if (error?.message === "DAILY_TIP_RETRYABLE") throw error;
      throw dailyTipError();
    } finally {
      clearTimeout(timer);
    }
  };
}

function unwrapCompletion(raw) {
  if (typeof raw === "string") return { payload: raw, usage: null };
  if (raw && typeof raw === "object" && typeof raw.content === "string" && !raw.type && !raw.headline && !raw.prompt) {
    return { payload: raw.content, usage: raw.usage || null };
  }
  return { payload: raw, usage: raw && typeof raw === "object" ? raw.usage || null : null };
}

function createDailyTipService({ apiKey, model, requestCompletion, contextProvider, random = Math.random, source = "deepseek" } = {}) {
  const selectedModel = typeof model === "string" && model.trim() ? model.trim() : "deepseek-v4-flash";
  const complete = requestCompletion ?? (apiKey ? createDeepseekDailyTipCompletion({ apiKey, model: selectedModel }) : null);
  const getDailyTip = async ({ date, context } = {}) => {
    if (typeof date !== "string" || !datePattern.test(date)) throw dailyTipError("DAILY_TIP_INPUT_INVALID");
    const nutritionContext = context ?? (typeof contextProvider === "function" ? await contextProvider(date) : {});
    const types = ["nutrition_tip", "food_function", "food_knowledge"];
    const type = types[Math.min(types.length - 1, Math.floor(random() * types.length))];
    if (!complete) return { ...pickFallback(type, random), source: "rule_v2", model: null, usage: null };
    try {
      const raw = unwrapCompletion(await complete({ date, type, context: nutritionContext }));
      const tip = validateDailyTip(raw.payload);
      return { ...tip, source, model: selectedModel, usage: raw.usage };
    } catch {
      return { ...pickFallback(type, random), source: "rule_v2", model: null, usage: null };
    }
  };

  getDailyTip.getQuickPrompt = async ({ date, context } = {}) => {
    if (typeof date !== "string" || !datePattern.test(date)) throw dailyTipError("DAILY_TIP_INPUT_INVALID");
    const nutritionContext = context ?? (typeof contextProvider === "function" ? await contextProvider(date) : {});
    if (!complete) return { prompt: pickCoachQuickPrompt(random), source: "rule_v2", model: null, usage: null };
    try {
      const raw = unwrapCompletion(await complete({ purpose: "coach_quick_prompt", context: nutritionContext }));
      const prompt = validateCoachQuickPrompt(raw.payload);
      return { prompt, source, model: selectedModel, usage: raw.usage };
    } catch {
      return { prompt: pickCoachQuickPrompt(random), source: "rule_v2", model: null, usage: null };
    }
  };

  return getDailyTip;
}

module.exports = { DAILY_TIP_SYSTEM_PROMPT, COACH_QUICK_PROMPT_SYSTEM_PROMPT, createDailyTipService, createDeepseekDailyTipCompletion, validateDailyTip, validateCoachQuickPrompt };
