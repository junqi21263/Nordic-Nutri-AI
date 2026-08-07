const { extractContentAndUsage } = require("./model-usage.cjs");

const themes = new Set([
  "starter",
  "protein_gap",
  "energy_gap",
  "meal_rhythm",
  "dietary_balance",
  "progress",
  "consistency",
]);
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const unsafeWording = /诊断|治疗|处方|药物|吃药|用药|孕期|怀孕|哺乳|厌食|暴食|替代医疗/i;
const presentationWording = /```|[`*#]|^\s*(?:回复|答复|回答|建议|说明)\s*[:：]/m;

const PROACTIVE_DAILY_BRIEF_SYSTEM_PROMPT = `你是 Nordic Nutri AI 的 NOVA，每日营养陪伴教练。你的任务不是等待用户提问，而是在用户打开 App 时，根据 dailyContext 主动提供一句最有价值的营养提醒。NOVA 是温和、专业、了解用户一段时间的长期陪伴教练：简洁鼓励，不夸张，不像医疗报告。只使用 dailyContext 提供的事实，绝不编造饮食、体重、训练或运动表现。根据 userJourneyStage 调整表达：first_day 帮助开始记录；first_week 帮助建立习惯；habit_building 强化坚持；stable_tracking 关注优化；goal_progress 反馈已发生的饮食进步。recentTrend 只有在明确为正向变化时才可选择 progress，必须说明可验证的完成率或记录变化；没有趋势事实时不要假装进步。先从今日/昨日完成情况、目标、蛋白或热量缺口、饮食偏好和忌口、记录习惯、使用阶段中选择唯一最重要的行动。推荐必须符合 dietaryPattern 和 avoidances，不能推荐忌口食物。避免连续重复：recentThemes 中已出现的主题，除非是唯一明确的营养缺口，否则不要再次选择。只围绕饮食营养，不讨论训练、恢复或运动表现；不得诊断、治疗、开药、承诺减重或增肌效果。输出只能是 JSON，不要 Markdown 或额外解释：{"greeting":"不超过18字","summary":"不超过42字","mealLabel":"早餐建议|午餐建议|晚餐建议|加餐建议","suggestion":"不超过48字","reason":"不超过36字","theme":"starter|protein_gap|energy_gap|meal_rhythm|dietary_balance|progress|consistency","action":"不超过28字"}`;

function error(code = "PROACTIVE_DAILY_BRIEF_RETRYABLE") {
  return new Error(code);
}

function text(value, maxLength) {
  if (typeof value !== "string") return null;
  const result = value.trim();
  return result && result.length <= maxLength ? result : null;
}

function validateProactiveDailyBrief(payload) {
  let value = payload;
  try {
    if (typeof value === "string") value = JSON.parse(value);
  } catch {
    throw error();
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) throw error();
  const greeting = text(value.greeting, 18);
  const summary = text(value.summary, 42);
  const mealLabel = text(value.mealLabel, 8);
  const suggestion = text(value.suggestion, 48);
  const reason = text(value.reason, 36);
  const theme = text(value.theme, 24);
  const action = text(value.action, 28);
  const combined = [greeting, summary, mealLabel, suggestion, reason, action].filter(Boolean).join("\n");
  if (!greeting || !summary || !["早餐建议", "午餐建议", "晚餐建议", "加餐建议"].includes(mealLabel) || !suggestion || !reason || !theme || !themes.has(theme) || !action || unsafeWording.test(combined) || presentationWording.test(combined)) {
    throw error();
  }
  return { greeting, summary, mealLabel, suggestion, reason, theme, action };
}

function periodMealLabel(period) {
  if (period === "noon") return "午餐建议";
  if (period === "evening") return "晚餐建议";
  if (period === "snack") return "加餐建议";
  return "早餐建议";
}

function isAvoided(context, word) {
  return (context?.preference?.avoidances ?? []).some((item) => String(item).includes(word));
}

function fallbackForContext(context = {}) {
  const name = text(context?.user?.name, 12) || "你";
  const period = context?.today?.period || "morning";
  const mealLabel = periodMealLabel(period);
  const proteinRate = Number(context?.yesterday?.proteinRate);
  const caloriesRate = Number(context?.yesterday?.caloriesRate);
  const days = Math.max(0, Number(context?.habit?.continuousDays) || 0);
  const stage = context?.userJourneyStage;
  const soyProtein = isAvoided(context, "豆") ? "鸡蛋 + 燕麦 + 水果" : "鸡蛋 + 燕麦 + 无糖豆浆";
  const dairyProtein = "鸡蛋 + 燕麦 + 牛奶";
  const proteinSuggestion = isAvoided(context, "牛奶") ? soyProtein : dairyProtein;

  if (stage === "first_day" || !context?.yesterday?.recorded) {
    return {
      greeting: `你好，${name} 👋`,
      summary: "今天开始你的营养计划，先从记录第一餐开始。",
      mealLabel,
      suggestion: period === "morning" ? proteinSuggestion : "这一餐安排蛋白质、蔬菜和适量主食",
      reason: "有了第一条记录，NOVA 才能给出更贴合的提醒。",
      theme: "starter",
      action: "先完成今天第一餐记录",
    };
  }
  if (Number.isFinite(proteinRate) && proteinRate < 80) {
    return {
      greeting: `早上好，${name} 👋`,
      summary: `昨天蛋白完成 ${Math.round(proteinRate)}%，今天优先把一餐蛋白补起来。`,
      mealLabel,
      suggestion: proteinSuggestion,
      reason: "帮助你更接近今天的蛋白目标。",
      theme: "protein_gap",
      action: `${mealLabel.replace("建议", "")}优先补足蛋白`,
    };
  }
  if (Number.isFinite(caloriesRate) && (caloriesRate < 75 || caloriesRate > 125)) {
    return {
      greeting: `你好，${name} 👋`,
      summary: `昨天热量完成 ${Math.round(caloriesRate)}%，今天把餐次节奏放稳。`,
      mealLabel,
      suggestion: "安排一份蛋白质、半盘蔬菜和适量主食",
      reason: "稳定每餐结构比集中补一餐更容易坚持。",
      theme: "energy_gap",
      action: "这一餐按均衡搭配准备",
    };
  }
  if (days >= 5) {
    return {
      greeting: `早上好，${name} 👋`,
      summary: `你已连续记录 ${days} 天，饮食节奏正在变得更稳定。`,
      mealLabel,
      suggestion: "继续按目标完成这一餐，并补充一份蔬菜",
      reason: "持续记录会让每天的营养反馈更准确。",
      theme: "consistency",
      action: "保持今天的记录节奏",
    };
  }
  return {
    greeting: `你好，${name} 👋`,
    summary: "今天先把每一餐的结构安排得更均衡。",
    mealLabel,
    suggestion: "选择一份蛋白质、蔬菜和适量主食",
    reason: "均衡搭配能让你更稳定地接近每日目标。",
    theme: "dietary_balance",
    action: "这一餐按均衡结构搭配",
  };
}

function createDeepseekCompletion({ apiKey, model, fetchImpl = globalThis.fetch } = {}) {
  if (typeof apiKey !== "string" || !apiKey.trim() || typeof fetchImpl !== "function") return null;
  return async ({ context }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetchImpl("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          thinking: { type: "disabled" },
          response_format: { type: "json_object" },
          temperature: 0.55,
          max_tokens: 180,
          messages: [
            { role: "system", content: PROACTIVE_DAILY_BRIEF_SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify({ dailyContext: context }) },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw error();
      const parsed = extractContentAndUsage(await response.json());
      return { content: parsed.content, usage: parsed.usage };
    } catch {
      throw error();
    } finally {
      clearTimeout(timer);
    }
  };
}

function createProactiveDailyBriefService({ apiKey, model = "deepseek-v4-flash", requestCompletion, fetchImpl } = {}) {
  const complete = requestCompletion ?? createDeepseekCompletion({ apiKey, model, fetchImpl });
  return async ({ date, context } = {}) => {
    if (!datePattern.test(date || "")) throw error("PROACTIVE_DAILY_BRIEF_INPUT_INVALID");
    if (!complete) return { ...fallbackForContext(context), source: "rule_v2", model: null, usage: null };
    try {
      const raw = await complete({ date, context });
      const payload = raw && typeof raw === "object" && "content" in raw ? raw.content : raw;
      return { ...validateProactiveDailyBrief(payload), source: "deepseek", model, usage: raw?.usage ?? null };
    } catch {
      return { ...fallbackForContext(context), source: "rule_v2", model: null, usage: null };
    }
  };
}

module.exports = {
  PROACTIVE_DAILY_BRIEF_SYSTEM_PROMPT,
  createProactiveDailyBriefService,
  validateProactiveDailyBrief,
};
