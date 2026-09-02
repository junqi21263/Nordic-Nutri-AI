const crypto = require("node:crypto");

const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const insightFocuses = new Set(["protein", "calories", "carbs", "fat", "fiber", "logging", "regularity"]);
const unsafeInsightWording = /诊断|治疗|处方|药物|吃药|用药|孕期|怀孕|哺乳|未成年|厌食|暴食|替代医疗/i;
const forbiddenPresentationWording = /```|[`*#]|^\s*(?:回复|答复|回答|建议|说明)\s*[:：]/m;

const DAILY_INSIGHT_SYSTEM_PROMPT = `你是 Nordic Nutri 首页的每日营养洞察编辑。nutritionContext 是唯一权威营养事实；不得猜测、补造或改写未提供的健康状况、训练安排、食物克数、营养数值或餐食记录。只面向普通成年人提供日常饮食提示。必须尊重 preferences 中的饮食模式、忌口与每日餐次：推荐食材不得与 foodAvoidances / foodAvoidanceLabels 冲突，并贴合 dietaryPattern 与 mealsPerDay。

请只选择一个最优先方向：蛋白质、总能量、碳水、脂肪、膳食纤维、记录完整度或规律性。洞察必须体现当天的真实状态：有可靠数值时优先引用一个缺口、进度或已记录餐次数；有真实餐次时可以提及下一餐场景，但不要罗列多个问题或重复通用口号。先给一句明确结论，再给一个可执行的下一步行动（食物类别、搭配或记录动作）；避免只说“均衡饮食”“注意营养”。若当天尚未记录，也可结合偏好/忌口给出更具体的开记建议。

不得诊断、治疗、开药、保证减重或增肌效果；不得涉及疾病、药物、孕产、未成年人、进食障碍或替代医疗。不要做品牌广告。输出约束：只输出 JSON，不要 Markdown、代码块、标题符号或额外解释；禁止使用双星号加粗、星号、反引号或以“回复：”“答复：”“回答：”“建议：”“说明：”开头。JSON 字段值也必须是可直接展示的纯文本：{"focus":"protein|calories|carbs|fat|fiber|logging|regularity","headline":"不超过24个字符","content":"不超过140个字符"}。`;

function insightError(code = "DAILY_INSIGHT_RETRYABLE") {
  return new Error(code);
}

function boundedText(value, maxLength) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= maxLength ? text : null;
}

function safeNumber(value) {
  return Math.max(0, Math.round(Number(value) || 0));
}

function validateDailyInsight(payload) {
  let value = payload;
  try {
    if (typeof value === "string") value = JSON.parse(value);
  } catch {
    throw insightError();
  }
  if (!value || typeof value !== "object" || Array.isArray(value) || !insightFocuses.has(value.focus)) {
    throw insightError();
  }
  const headline = boundedText(value.headline, 24);
  const content = boundedText(value.content, 140);
  if (!headline || !content || unsafeInsightWording.test(`${headline}\n${content}`) || forbiddenPresentationWording.test(`${headline}\n${content}`)) throw insightError();
  return { focus: value.focus, headline, content };
}

function assertDate(value) {
  if (typeof value !== "string" || !datePattern.test(value)) throw insightError("DAILY_INSIGHT_INPUT_INVALID");
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw insightError("DAILY_INSIGHT_INPUT_INVALID");
  return value;
}

function preferenceHint(context) {
  const pattern = context?.preferences?.dietaryPattern;
  const patternLabel = context?.preferences?.dietaryPatternLabel;
  const avoidLabels = Array.isArray(context?.preferences?.foodAvoidanceLabels)
    ? context.preferences.foodAvoidanceLabels.filter(Boolean)
    : [];
  const mealsPerDay = Number(context?.preferences?.mealsPerDay);
  const parts = [];
  if (pattern && pattern !== "none" && patternLabel && patternLabel !== "无特殊") {
    parts.push(patternLabel);
  }
  if (avoidLabels[0]) parts.push(`忌${avoidLabels[0]}`);
  if (Number.isFinite(mealsPerDay) && mealsPerDay >= 2 && mealsPerDay <= 5 && mealsPerDay !== 3) {
    parts.push(`每天${mealsPerDay}餐`);
  }
  return {
    avoidLabels,
    patternLabel: parts[0] && pattern && pattern !== "none" ? patternLabel : null,
    summary: parts.join(" · "),
    proteinFoods:
      avoidLabels.some((label) => /鸡蛋|蛋/.test(label))
        ? "豆腐、鱼或鸡胸肉"
        : avoidLabels.some((label) => /海鲜|鱼|虾/.test(label))
          ? "鸡胸肉、鸡蛋或豆腐"
          : "鱼、鸡胸肉、鸡蛋或豆腐",
  };
}

function createRuleInsight(context) {
  const daily = context?.daily ?? {};
  const targets = daily.targets ?? {};
  const consumed = daily.consumed ?? {};
  const remaining = daily.remaining ?? {};
  const mealCount = safeNumber(daily.mealCount);
  const proteinRemaining = safeNumber(remaining.protein);
  const calorieRemaining = safeNumber(remaining.calories);
  const carbsRemaining = safeNumber(remaining.carbs);
  const fatConsumed = safeNumber(consumed.fat);
  const fatTarget = safeNumber(targets.fat);
  const prefs = preferenceHint(context);

  if (!mealCount) {
    if (prefs.summary) {
      return {
        focus: "logging",
        headline: prefs.avoidLabels[0] ? `忌${prefs.avoidLabels[0]}也先记一餐` : "按你的偏好开记",
        content: `今天还没记录。先记下下一餐大致份量；${prefs.summary}，再按真实进度调整会更贴合你。`.slice(0, 140),
      };
    }
    return {
      focus: "logging",
      headline: "先记录第一餐",
      content: "今天还没有餐次记录。先补记已吃的一餐和大致份量，再根据真实进度安排下一餐会更准确。",
    };
  }
  if (fatTarget > 0 && fatConsumed > fatTarget) {
    return {
      focus: "fat",
      headline: "下一餐清淡一点",
      content: `脂肪已比目标多约 ${fatConsumed - fatTarget}g。下一餐选瘦肉或豆制品，配蔬菜和主食，少用油炸、浓酱。`,
    };
  }
  if (proteinRemaining >= 20) {
    return {
      focus: "protein",
      headline: "晚些补一份蛋白",
      content: `你今天已记录 ${mealCount} 餐，还差约 ${proteinRemaining}g 蛋白质；下一餐先安排${prefs.proteinFoods}，再配蔬菜和主食。`.slice(0, 140),
    };
  }
  if (carbsRemaining >= 60) {
    return {
      focus: "carbs",
      headline: "主食别留到太晚",
      content: `碳水还有约 ${carbsRemaining}g 的空间。下一餐可加入米饭、土豆或全谷物，并搭配蛋白质和蔬菜。`,
    };
  }
  if (calorieRemaining >= 400) {
    return {
      focus: "calories",
      headline: "把能量分到下一餐",
      content: `今天还可安排约 ${calorieRemaining} kcal。下一餐用优质蛋白、主食和蔬菜组成完整餐盘，不必靠零食一次补足。`,
    };
  }
  return {
    focus: "regularity",
    headline: "今天的节奏很稳",
    content: `你已记录 ${mealCount} 餐，主要营养进度接近目标。接下来按饥饿感规律进餐，优先保留蔬菜和优质蛋白。`,
  };
}

const { extractContentAndUsage } = require("./model-usage.cjs");

function createDeepseekDailyInsightCompletion({ apiKey, model, fetchImpl = globalThis.fetch } = {}) {
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("DeepSeek configuration is incomplete");
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable");
  const selectedModel = typeof model === "string" && model.trim() ? model.trim() : "deepseek-v4-flash";
  return async ({ date, context }) => {
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
          temperature: 0.45,
          max_tokens: 180,
          messages: [
            { role: "system", content: DAILY_INSIGHT_SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify({ date, nutritionContext: context }) },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw insightError();
      const data = await response.json();
      const parsed = extractContentAndUsage(data);
      return { content: parsed.content, usage: parsed.usage };
    } catch (error) {
      if (error?.message === "DAILY_INSIGHT_RETRYABLE") throw error;
      throw insightError();
    } finally {
      clearTimeout(timer);
    }
  };
}

function createCloudbaseDailyInsightCompletion({ ai, model, groupName = "cloudbase" } = {}) {
  if (!ai || typeof ai.createModel !== "function") throw new Error("CloudBase AI client is unavailable");
  if (groupName !== "cloudbase") throw new Error("CloudBase AI group is unavailable");
  const { extractUsageFromAny } = require("./model-usage.cjs");
  const selectedModel = typeof model === "string" && model.trim() ? model.trim() : "hy3";
  return async ({ date, context }) => {
    try {
      const chatModel = ai.createModel(groupName);
      if (!chatModel || typeof chatModel.generateText !== "function") throw insightError();
      const response = await chatModel.generateText({
        model: selectedModel,
        temperature: 0.45,
        messages: [
          { role: "system", content: DAILY_INSIGHT_SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify({ date, nutritionContext: context }) },
        ],
      });
      if (typeof response?.text !== "string") throw insightError();
      return { content: response.text, usage: extractUsageFromAny(response) };
    } catch (error) {
      if (error?.message === "DAILY_INSIGHT_RETRYABLE") throw error;
      throw insightError();
    }
  };
}

function createDailyInsightService({ ai, apiKey, model, requestCompletion, source, fetchImpl, routeManaged = false } = {}) {
  const cloudbaseEnabled = ai && typeof ai.createModel === "function";
  const selectedModel = typeof model === "string" && model.trim() ? model.trim() : (cloudbaseEnabled ? "hy3" : "deepseek-v4-flash");
  const resolvedSource = source ?? (cloudbaseEnabled ? "cloudbase" : "deepseek");
  const complete = requestCompletion ?? (cloudbaseEnabled
    ? createCloudbaseDailyInsightCompletion({ ai, model: selectedModel })
    : (apiKey ? createDeepseekDailyInsightCompletion({ apiKey, model: selectedModel, fetchImpl }) : null));
  return async ({ date, context } = {}) => {
    assertDate(date);
    if (!complete) return { ...createRuleInsight(context), source: "rule_v3", model: null, usage: null };
    try {
      const raw = await complete({ date, context });
      const content = typeof raw === "string" ? raw : raw?.content;
      const usage = typeof raw === "object" && raw ? raw.usage : null;
      const insight = validateDailyInsight(content);
      return { ...insight, source: resolvedSource, model: selectedModel, usage };
    } catch (error) {
      if (routeManaged) throw error;
      return { ...createRuleInsight(context), source: "rule_v3", model: null, usage: null };
    }
  };
}

function createDailyInsightHash(context) {
  return crypto.createHash("sha256").update(JSON.stringify(context)).digest("hex");
}

module.exports = {
  DAILY_INSIGHT_SYSTEM_PROMPT,
  createDailyInsightHash,
  createCloudbaseDailyInsightCompletion,
  createDailyInsightService,
  createDeepseekDailyInsightCompletion,
  createRuleInsight,
  validateDailyInsight,
};
