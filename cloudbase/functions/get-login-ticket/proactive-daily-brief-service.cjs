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
const staleNoMealClaim = /没有餐次|没有.*记录|第一餐|首餐/i;

const PROACTIVE_DAILY_BRIEF_SYSTEM_PROMPT = `你是 Nordic Nutri AI 的 NOVA，长期陪伴用户管理饮食目标的 AI 营养教练。用户打开 App 时，你主动给出当天最有价值的提醒；不是长篇报告。只使用 dailyContext 提供的事实，绝不编造饮食、体重、训练或运动表现。按 userJourneyStage 调整重点：new_user 帮助开始第一餐记录；habit_building 强化连续记录习惯；regular_user 优先依据 recentTrend 反馈近期变化或当前最重要缺口。每日从行动提醒、数据反馈、鼓励反馈、习惯培养中选择唯一主题；结合目标语言：muscle_gain=增益增肌、fat_loss=轻盈减脂、maintain=保持状态、performance=健康饮食。避免连续重复：recentThemes 的第一个主题是昨天主题，今天绝不能输出同一主题。只围绕饮食营养，不讨论训练、恢复或运动表现；不得诊断、治疗、开药、承诺减重或增肌效果。输出只能是 JSON，不要 Markdown 或额外解释。首卡只负责一个今日最重要行动，绝不能包含具体食物、食材、搭配或“早餐建议”等饮食推荐；具体饮食优化会由另一张卡片展示。必须恰好 3 段短句：greeting 为按当前时段和姓名的问候；summary 为一句有数据的观察、鼓励或启动提醒；suggestion 必须以“今日行动：”开头，给出一个可执行动作。不要使用“欢迎开启营养之旅”。JSON：{"greeting":"不超过18字","summary":"不超过40字","suggestion":"不超过50字","theme":"starter|protein_gap|energy_gap|meal_rhythm|dietary_balance|progress|consistency"}`;

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
  const summary = text(value.summary, 40);
  const suggestion = text(value.suggestion, 50);
  const theme = text(value.theme, 24);
  const combined = [greeting, summary, suggestion].filter(Boolean).join("\n");
  if (!greeting || !summary || !suggestion || !/^今日行动：/.test(suggestion) || !theme || !themes.has(theme) || unsafeWording.test(combined) || presentationWording.test(combined)) {
    throw error();
  }
  return { greeting, summary, suggestion, theme };
}

function periodGreeting(period, name) {
  const prefix = period === "noon" ? "中午好" : period === "evening" ? "晚上好" : period === "snack" ? "下午好" : "早上好";
  return `${prefix}，${name} 👋`;
}

function periodMealName(period) {
  if (period === "noon") return "午餐";
  if (period === "evening") return "晚餐";
  if (period === "snack") return "加餐";
  return "早餐";
}

function selectTheme(preferred, alternatives, recentThemes) {
  return [preferred, ...alternatives].find((theme) => theme !== recentThemes?.[0]) || preferred;
}

function actionForTheme(theme, period) {
  const meal = periodMealName(period);
  return ({
    starter: `今日行动：记录${meal}，完成今天的第一条饮食数据。`,
    protein_gap: `今日行动：记录${meal}，优先完成今天的蛋白目标。`,
    energy_gap: `今日行动：安排并记录${meal}，让全天摄入更接近目标。`,
    meal_rhythm: `今日行动：按时记录${meal}，保持今天的餐次节奏。`,
    dietary_balance: `今日行动：完成${meal}记录，补齐今天的饮食数据。`,
    progress: `今日行动：延续当前节奏，完成${meal}后查看今日进度。`,
    consistency: `今日行动：记录${meal}，保持今天的连续记录节奏。`,
  })[theme];
}

function fallbackForContext(context = {}) {
  const name = text(context?.user?.name, 12) || "你";
  const period = context?.today?.period || "morning";
  const proteinRate = Number(context?.yesterday?.proteinRate);
  const caloriesRate = Number(context?.yesterday?.caloriesRate);
  const days = Math.max(0, Number(context?.habit?.continuousDays) || 0);
  const stage = context?.userJourneyStage;
  const greeting = periodGreeting(period, name);
  const recentThemes = Array.isArray(context?.recentThemes) ? context.recentThemes : [];
  let preferred = "dietary_balance";
  let alternatives = ["meal_rhythm", "starter", "consistency", "progress"];
  let summary = "今天先把每一餐的结构安排得更均衡。";

  const hasTodayMealRecord = Boolean(context?.today?.hasMealRecord) || Number(context?.today?.recordedMeals) > 0;
  if (!hasTodayMealRecord && (stage === "new_user" || !context?.yesterday?.recorded)) {
    preferred = "starter";
    alternatives = ["meal_rhythm", "dietary_balance", "consistency"];
    summary = "今天先完成一餐记录，建立自己的饮食基线。";
  } else if (Number.isFinite(proteinRate) && proteinRate < 80) {
    preferred = "protein_gap";
    alternatives = ["meal_rhythm", "dietary_balance", "consistency"];
    summary = `昨天蛋白完成 ${Math.round(proteinRate)}%，今天继续补足。`;
  } else if (Number.isFinite(caloriesRate) && (caloriesRate < 75 || caloriesRate > 125)) {
    preferred = "energy_gap";
    alternatives = ["meal_rhythm", "dietary_balance", "consistency"];
    summary = `昨天热量完成 ${Math.round(caloriesRate)}%，今天把节奏放稳。`;
  } else if (stage === "habit_building" || days >= 5) {
    preferred = "consistency";
    alternatives = ["meal_rhythm", "progress", "dietary_balance"];
    summary = `你已连续记录 ${days} 天，饮食节奏正在变得更稳定。`;
  } else if (stage === "regular_user") {
    preferred = "progress";
    alternatives = ["dietary_balance", "meal_rhythm", "consistency"];
    summary = "保持当前节奏，今天继续完成自己的营养目标。";
  }
  const theme = selectTheme(preferred, alternatives, recentThemes);
  return {
    greeting,
    summary,
    suggestion: actionForTheme(theme, period),
    theme,
  };
}

function enforceBriefFacts(context, brief) {
  const hasTodayMealRecord = Boolean(context?.today?.hasMealRecord) || Number(context?.today?.recordedMeals) > 0;
  const combined = [brief?.summary, brief?.suggestion].filter(Boolean).join("\n");
  return hasTodayMealRecord && staleNoMealClaim.test(combined) ? fallbackForContext(context) : brief;
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
          max_tokens: 120,
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

function createProactiveDailyBriefService({ apiKey, model = "deepseek-v4-flash", requestCompletion, fetchImpl, source = "deepseek", routeManaged = false } = {}) {
  const complete = requestCompletion ?? createDeepseekCompletion({ apiKey, model, fetchImpl });
  const generateBrief = async ({ date, context }) => {
    if (!complete) return { ...fallbackForContext(context), source: "rule_v2", model: null, usage: null };
    try {
      const raw = await complete({ date, context });
      const payload = raw && typeof raw === "object" && "content" in raw ? raw.content : raw;
      const brief = validateProactiveDailyBrief(payload);
      const recentThemes = Array.isArray(context?.recentThemes) ? context.recentThemes : [];
      if (recentThemes[0] === brief.theme) throw error();
      const consistentBrief = enforceBriefFacts(context, brief);
      const usedFactFallback = consistentBrief !== brief;
      return {
        ...consistentBrief,
        source: usedFactFallback ? "rule_v2" : source,
        model: usedFactFallback ? null : model,
        usage: usedFactFallback ? null : raw?.usage ?? null,
      };
    } catch (error) {
      if (routeManaged) throw error;
      return { ...fallbackForContext(context), source: "rule_v2", model: null, usage: null };
    }
  };
  return async ({ date, context, preferFast = false } = {}) => {
    if (!datePattern.test(date || "")) throw error("PROACTIVE_DAILY_BRIEF_INPUT_INVALID");
    if (!preferFast) return generateBrief({ date, context });
    return {
      ...fallbackForContext(context),
      source: "rule_v2",
      model: null,
      usage: null,
      upgrade: generateBrief({ date, context }),
    };
  };
}

module.exports = {
  PROACTIVE_DAILY_BRIEF_SYSTEM_PROMPT,
  createProactiveDailyBriefService,
  validateProactiveDailyBrief,
};
