const crypto = require("node:crypto");

const forbiddenPresentationWording = /```|[`*#]|^\s*(?:回复|答复|回答|建议|说明)\s*[:：]/m;
const unsafeWording = /诊断|治疗|处方|药物|吃药|用药|孕期|怀孕|哺乳|未成年|厌食|暴食|替代医疗/i;
/** Sparse weeks stay on rules — AI needs enough days to be meaningful and cheap. */
const MIN_RECORDED_DAYS_FOR_AI = 3;
const WEEKLY_REVIEW_TIMEOUT_MS = 10_000;
const WEEKLY_REVIEW_SYSTEM_PROMPT = `你是 Nordic Nutri 的周期营养总结编辑。weeklyContext 是唯一权威事实，只面向普通成年人总结最近7天饮食记录。

请准确区分记录天数、餐次数、热量和四项营养进度；不要把未记录的天数当成已达标，也不要补造用户没有提供的食物、健康状况或训练安排。输出必须给出一个本周观察和一个下周可执行动作，语气客观、简洁、鼓励，不夸大效果。文案中的天数、餐次、完成度百分比必须与 weeklyContext 一致，不得改写数字。

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

function shouldGenerateWeeklyAi(context) {
  return Number(context?.weekly?.recordedDays ?? 0) >= MIN_RECORDED_DAYS_FOR_AI;
}

function createFallbackWeeklyReview(context) {
  const weekly = context?.weekly ?? {};
  const recordedDays = Number(weekly.recordedDays ?? 0);
  const recordedMeals = Number(weekly.recordedMeals ?? 0);
  const proteinCompletion = Number(weekly.proteinCompletion ?? 0);
  const calorieCompletion = Number(weekly.calorieCompletion ?? 0);
  const score = Number(weekly.score ?? 0);

  if (recordedDays <= 0) {
    return {
      headline: "先从记录一餐开始",
      summary: "本周还没有足够的饮食记录，先记录一餐，下一次总结会更贴合实际。",
      strengths: [],
      nextSteps: ["下周每天先完成一餐记录"],
      source: "rule_v1",
      model: null,
    };
  }

  if (recordedDays < MIN_RECORDED_DAYS_FOR_AI) {
    return {
      headline: "记录天数不足，营养难评估",
      summary: `本周仅记录 ${recordedDays} 天共 ${recordedMeals} 餐，热量完成约 ${calorieCompletion}%，蛋白质约 ${proteinCompletion}%，整体数据偏少，暂难反映真实饮食节奏。`,
      strengths: ["有开始记录的意识，迈出第一步"],
      nextSteps: ["下周每天至少记录一餐，提升数据完整性"],
      source: "rule_v1",
      model: null,
    };
  }

  const strengths = [`本周已记录 ${recordedDays} 天、${recordedMeals} 餐`];
  if (proteinCompletion >= 80) strengths.push("蛋白质完成度较稳");
  else if (calorieCompletion >= 70) strengths.push("热量记录节奏尚可");

  let headline = "记录节奏可继续稳定";
  if (calorieCompletion < 50) headline = "热量完成偏低，可补一餐";
  else if (proteinCompletion < 70) headline = "蛋白质还可再抬一点";

  const nextSteps = [];
  if (recordedDays < 6) nextSteps.push("下周争取多记两天饮食");
  if (proteinCompletion < 80) nextSteps.push("下一周把蛋白质分配到每一餐");
  else nextSteps.push("下一周保持记录，并继续观察四项营养进度");

  return {
    headline,
    summary: `本周记录 ${recordedDays} 天、${recordedMeals} 餐，节奏分 ${score}，热量完成约 ${calorieCompletion}%，蛋白质约 ${proteinCompletion}%。`,
    strengths: strengths.slice(0, 2),
    nextSteps: nextSteps.slice(0, 2),
    source: "rule_v1",
    model: null,
  };
}

function createWeeklyCompletion({ apiKey, model, fetchImpl = globalThis.fetch, timeoutMs = WEEKLY_REVIEW_TIMEOUT_MS } = {}) {
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("DeepSeek configuration is incomplete");
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable");
  const selectedModel = typeof model === "string" && model.trim() ? model.trim() : "deepseek-v4-pro";
  return async ({ date, context }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
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
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("WEEKLY_REVIEW_RETRYABLE");
      return (await response.json())?.choices?.[0]?.message?.content;
    } catch (error) {
      if (error?.message === "WEEKLY_REVIEW_RETRYABLE") throw error;
      throw new Error("WEEKLY_REVIEW_RETRYABLE");
    } finally {
      clearTimeout(timer);
    }
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
    if (!shouldGenerateWeeklyAi(context) || !complete) return fallback;
    try {
      const result = validateWeeklyReview(await complete({ date, context }));
      return result ? { ...result, source: "deepseek", model: selectedModel } : fallback;
    } catch {
      return fallback;
    }
  };
}

module.exports = {
  MIN_RECORDED_DAYS_FOR_AI,
  WEEKLY_REVIEW_SYSTEM_PROMPT,
  WEEKLY_REVIEW_TIMEOUT_MS,
  createDeepseekWeeklyReviewService,
  createFallbackWeeklyReview,
  createWeeklyReviewHash,
  shouldGenerateWeeklyAi,
  validateWeeklyReview,
  weeklyReviewContext,
};
