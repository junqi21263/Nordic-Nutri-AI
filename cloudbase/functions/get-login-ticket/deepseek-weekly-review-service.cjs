const crypto = require("node:crypto");

const forbiddenPresentationWording = /```|[`*#]|^\s*(?:回复|答复|回答|建议|说明)\s*[:：]/m;
const unsafeWording = /诊断|治疗|处方|药物|吃药|用药|孕期|怀孕|哺乳|未成年|厌食|暴食|替代医疗/i;
const WEEKLY_REVIEW_SYSTEM_PROMPT = `你是 Nordic Nutri 的周期营养总结编辑。weeklyContext 是唯一权威事实，只面向普通成年人总结最近7天饮食记录。

请准确区分记录天数、餐次数、热量和四项营养进度；不要把未记录的天数当成已达标，也不要补造用户没有提供的食物、健康状况或训练安排。输出必须给出一个本周观察和一个下周可执行动作，语气客观、简洁、鼓励，不夸大效果。

不得诊断、治疗、开药、保证减重或增肌效果；不得涉及疾病、药物、孕产、未成年人、进食障碍或替代医疗。输出约束：只输出 JSON，不要 Markdown、代码块、标题符号、星号、反引号或额外解释；禁止使用“回复：”“答复：”“回答：”“建议：”“说明：”作为开头。字段值必须是可直接展示的纯文本：{"headline":"不超过24个字符","summary":"不超过180个字符","strengths":["最多2条，每条不超过40字"],"nextSteps":["最多2条，每条不超过40字"]}。`;

function bounded(value, max) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= max && !forbiddenPresentationWording.test(text) && !unsafeWording.test(text) ? text : null;
}

function parsePayload(value) {
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return null; }
}

function validateWeeklyReview(value) {
  const payload = parsePayload(value);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const headline = bounded(payload.headline, 24);
  const summary = bounded(payload.summary, 180);
  const strengths = Array.isArray(payload.strengths) ? payload.strengths.map((item) => bounded(item, 40)).filter(Boolean).slice(0, 2) : [];
  const nextSteps = Array.isArray(payload.nextSteps) ? payload.nextSteps.map((item) => bounded(item, 40)).filter(Boolean).slice(0, 2) : [];
  if (!headline || !summary || !nextSteps.length) return null;
  return { headline, summary, strengths, nextSteps };
}

function weeklyReviewContext(review) {
  return {
    weekly: {
      startDate: review?.startDate,
      endDate: review?.endDate,
      score: Number(review?.score ?? 0),
      recordedMeals: Number(review?.recordedMeals ?? 0),
      recordedDays: Number(review?.recordedDays ?? 0),
      consistency: Number(review?.consistency ?? 0),
      calorieCompletion: Number(review?.calorieCompletion ?? 0),
      proteinCompletion: Number(review?.proteinCompletion ?? 0),
      carbsCompletion: Number(review?.carbsCompletion ?? 0),
      fatCompletion: Number(review?.fatCompletion ?? 0),
    },
  };
}

function createFallbackWeeklyReview(context) {
  const weekly = context?.weekly ?? {};
  const recordedDays = Number(weekly.recordedDays ?? 0);
  const proteinCompletion = Number(weekly.proteinCompletion ?? 0);
  return {
    headline: recordedDays ? "记录节奏可继续稳定" : "先从记录一餐开始",
    summary: recordedDays
      ? `本周记录 ${recordedDays} 天、${Number(weekly.recordedMeals ?? 0)} 餐，蛋白质完成度约 ${proteinCompletion}%。`
      : "本周还没有足够的饮食记录，先记录一餐，下一次总结会更贴合实际。",
    strengths: recordedDays ? [`已连续记录 ${recordedDays} 天`] : [],
    nextSteps: proteinCompletion < 80 ? ["下一周把蛋白质分配到每一餐"] : ["下一周保持记录，并继续观察四项营养进度"],
    source: "rule_v1",
    model: null,
  };
}

function createWeeklyCompletion({ apiKey, model, fetchImpl = globalThis.fetch } = {}) {
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("DeepSeek configuration is incomplete");
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable");
  const selectedModel = typeof model === "string" && model.trim() ? model.trim() : "deepseek-v4-pro";
  return async ({ date, context }) => {
    const response = await fetchImpl("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: selectedModel,
        thinking: { type: "disabled" },
        response_format: { type: "json_object" },
        temperature: 0.35,
        max_tokens: 260,
        messages: [
          { role: "system", content: WEEKLY_REVIEW_SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify({ date, weeklyContext: context }) },
        ],
      }),
    });
    if (!response.ok) throw new Error("WEEKLY_REVIEW_RETRYABLE");
    return (await response.json())?.choices?.[0]?.message?.content;
  };
}

function createWeeklyReviewHash(context) {
  return crypto.createHash("sha256").update(JSON.stringify(context)).digest("hex");
}

function createDeepseekWeeklyReviewService({ apiKey, model, requestCompletion, fetchImpl } = {}) {
  const selectedModel = typeof model === "string" && model.trim() ? model.trim() : "deepseek-v4-pro";
  const complete = requestCompletion ?? (apiKey ? createWeeklyCompletion({ apiKey, model: selectedModel, fetchImpl }) : null);
  return async ({ date, context } = {}) => {
    const fallback = createFallbackWeeklyReview(context);
    if (!complete) return fallback;
    try {
      const result = validateWeeklyReview(await complete({ date, context }));
      return result ? { ...result, source: "deepseek", model: selectedModel } : fallback;
    } catch {
      return fallback;
    }
  };
}

module.exports = {
  WEEKLY_REVIEW_SYSTEM_PROMPT,
  createDeepseekWeeklyReviewService,
  createFallbackWeeklyReview,
  createWeeklyReviewHash,
  validateWeeklyReview,
  weeklyReviewContext,
};
