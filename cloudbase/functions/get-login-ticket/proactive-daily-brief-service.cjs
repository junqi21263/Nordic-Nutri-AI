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

const PROACTIVE_DAILY_BRIEF_SYSTEM_PROMPT = `你是 Nordic Nutri AI 的 NOVA，长期陪伴用户管理饮食目标的 AI 营养教练。用户打开 App 时，你主动给出当天最有价值的提醒；不是长篇报告，也不是每天重复推荐食物。只使用 dailyContext 提供的事实，绝不编造饮食、体重、训练或运动表现。按 userJourneyStage 调整重点：first_day 帮助开始；first_week 与 habit_building 强化习惯；stable_tracking 关注优化；goal_progress 只在 recentTrend 有明确正向事实时反馈进步。每日从行动提醒、数据反馈、鼓励反馈、饮食建议、习惯培养中选择唯一主题；结合目标语言：muscle_gain=增益增肌、fat_loss=轻盈减脂、maintain=保持状态、performance=健康饮食。避免连续重复：若 recentThemes 最近两个主题相同，除非是唯一明确的蛋白或热量缺口，不得再次输出同一主题。推荐必须符合 dietaryPattern 和 avoidances，不能推荐忌口食物。只围绕饮食营养，不讨论训练、恢复或运动表现；不得诊断、治疗、开药、承诺减重或增肌效果。输出只能是 JSON，不要 Markdown 或额外解释。必须恰好 3 段短句：greeting 为按当前时段和姓名的问候；summary 为一句有数据的观察、鼓励或启动提醒；suggestion 以“早餐建议：”“午餐建议：”“晚餐建议：”或“加餐建议：”开头，给出当前餐次的具体搭配并自然关联目标。不要使用“欢迎开启营养之旅”。JSON：{"greeting":"不超过18字","summary":"不超过30字","suggestion":"不超过42字","theme":"starter|protein_gap|energy_gap|meal_rhythm|dietary_balance|progress|consistency"}`;

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
  const summary = text(value.summary, 30);
  const suggestion = text(value.suggestion, 42);
  const theme = text(value.theme, 24);
  const combined = [greeting, summary, suggestion].filter(Boolean).join("\n");
  if (!greeting || !summary || !suggestion || !/^(早餐建议|午餐建议|晚餐建议|加餐建议)：/.test(suggestion) || !theme || !themes.has(theme) || unsafeWording.test(combined) || presentationWording.test(combined)) {
    throw error();
  }
  return { greeting, summary, suggestion, theme };
}

function periodMealLabel(period) {
  if (period === "noon") return "午餐建议";
  if (period === "evening") return "晚餐建议";
  if (period === "snack") return "加餐建议";
  return "早餐建议";
}

function periodGreeting(period, name) {
  const prefix = period === "noon" ? "中午好" : period === "evening" ? "晚上好" : period === "snack" ? "下午好" : "早上好";
  return `${prefix}，${name} 👋`;
}

function goalLabel(goal) {
  return ({ muscle_gain: "增益增肌", fat_loss: "轻盈减脂", maintain: "保持状态", performance: "健康饮食" })[goal] || "健康饮食";
}

function mealSuggestion(period, meal, goal) {
  const label = periodMealLabel(period);
  const goalText = goalLabel(goal);
  return `${label}：${meal}，贴近今天的${goalText}目标。`;
}

function isAvoided(context, word) {
  return (context?.preference?.avoidances ?? []).some((item) => String(item).includes(word));
}

function fallbackForContext(context = {}) {
  const name = text(context?.user?.name, 12) || "你";
  const period = context?.today?.period || "morning";
  const proteinRate = Number(context?.yesterday?.proteinRate);
  const caloriesRate = Number(context?.yesterday?.caloriesRate);
  const days = Math.max(0, Number(context?.habit?.continuousDays) || 0);
  const stage = context?.userJourneyStage;
  const soyProtein = isAvoided(context, "豆") ? "鸡蛋 + 燕麦 + 水果" : "鸡蛋 + 燕麦 + 无糖豆浆";
  const dairyProtein = "鸡蛋 + 燕麦 + 牛奶";
  const proteinSuggestion = isAvoided(context, "牛奶") ? soyProtein : dairyProtein;
  const balancedMeal = period === "morning" ? proteinSuggestion : "优质蛋白、半盘蔬菜和适量主食";
  const greeting = periodGreeting(period, name);

  if (stage === "first_day" || !context?.yesterday?.recorded) {
    return {
      greeting,
      summary: "今天先记下一餐，慢慢建立自己的饮食节奏。",
      suggestion: mealSuggestion(period, balancedMeal, context?.user?.goal),
      theme: "starter",
    };
  }
  if (Number.isFinite(proteinRate) && proteinRate < 80) {
    return {
      greeting,
      summary: `昨天蛋白完成 ${Math.round(proteinRate)}%，今天继续补足。`,
      suggestion: mealSuggestion(period, proteinSuggestion, context?.user?.goal),
      theme: "protein_gap",
    };
  }
  if (Number.isFinite(caloriesRate) && (caloriesRate < 75 || caloriesRate > 125)) {
    return {
      greeting,
      summary: `昨天热量完成 ${Math.round(caloriesRate)}%，今天把节奏放稳。`,
      suggestion: mealSuggestion(period, "优质蛋白、半盘蔬菜和适量主食", context?.user?.goal),
      theme: "energy_gap",
    };
  }
  if (days >= 5) {
    return {
      greeting,
      summary: `你已连续记录 ${days} 天，饮食节奏正在变得更稳定。`,
      suggestion: mealSuggestion(period, "一份优质蛋白、蔬菜和适量主食", context?.user?.goal),
      theme: "consistency",
    };
  }
  return {
    greeting,
    summary: "今天先把每一餐的结构安排得更均衡。",
    suggestion: mealSuggestion(period, "一份优质蛋白、蔬菜和适量主食", context?.user?.goal),
    theme: "dietary_balance",
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

function createProactiveDailyBriefService({ apiKey, model = "deepseek-v4-flash", requestCompletion, fetchImpl } = {}) {
  const complete = requestCompletion ?? createDeepseekCompletion({ apiKey, model, fetchImpl });
  return async ({ date, context } = {}) => {
    if (!datePattern.test(date || "")) throw error("PROACTIVE_DAILY_BRIEF_INPUT_INVALID");
    if (!complete) return { ...fallbackForContext(context), source: "rule_v2", model: null, usage: null };
    try {
      const raw = await complete({ date, context });
      const payload = raw && typeof raw === "object" && "content" in raw ? raw.content : raw;
      const brief = validateProactiveDailyBrief(payload);
      const recentThemes = Array.isArray(context?.recentThemes) ? context.recentThemes : [];
      if (recentThemes[0] === brief.theme && recentThemes[1] === brief.theme && !["protein_gap", "energy_gap"].includes(brief.theme)) throw error();
      return { ...brief, source: "deepseek", model, usage: raw?.usage ?? null };
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
