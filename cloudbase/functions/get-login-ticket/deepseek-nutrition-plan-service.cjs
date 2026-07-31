/**
 * DeepSeek nutrition-plan calculator.
 * Returns daily calories + macros + a short Chinese insight.
 * Falls back to null when the model is unavailable so callers can use the local formula.
 */

const {
  dietaryPatternLabel,
  foodAvoidanceLabels,
} = require("./diet-preference-labels.cjs");

class PublicNutritionPlanError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

const GOAL_LABELS = {
  muscle_gain: "精益增肌",
  fat_loss: "稳健减脂",
  maintenance: "保持体型",
  maintain: "保持体型",
  performance: "提升运动表现",
};

const ACTIVITY_LABELS = {
  sedentary: "低活动（久坐为主）",
  light: "轻度活动",
  moderate: "中等活动",
  high: "高活动",
  very_high: "很高活动",
};

function roundToTen(value) {
  return Math.round(Number(value) / 10) * 10;
}

function normalizePlan(raw) {
  const calories = roundToTen(raw.calories);
  const proteinG = Math.round(Number(raw.proteinG));
  const fatG = Math.round(Number(raw.fatG));
  const carbsG = Math.round(Number(raw.carbsG));
  if (!Number.isFinite(calories) || calories < 1200 || calories > 5000) return null;
  if (!Number.isFinite(proteinG) || proteinG < 40 || proteinG > 350) return null;
  if (!Number.isFinite(fatG) || fatG < 20 || fatG > 200) return null;
  if (!Number.isFinite(carbsG) || carbsG < 50 || carbsG > 800) return null;
  const macroCalories = proteinG * 4 + carbsG * 4 + fatG * 9;
  if (Math.abs(macroCalories - calories) / calories > 0.08) return null;
  const insight =
    typeof raw.insight === "string" && raw.insight.trim()
      ? raw.insight.trim().slice(0, 80)
      : null;
  return { calories, proteinG, carbsG, fatG, insight, source: "deepseek" };
}

function extractJson(content) {
  if (typeof content !== "string") return null;
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function createDeepseekNutritionPlanService({ apiKey, model, fetchImpl = globalThis.fetch } = {}) {
  if (typeof apiKey !== "string" || !apiKey.trim()) return null;
  if (typeof fetchImpl !== "function") return null;
  const selectedModel = typeof model === "string" && model.trim() ? model.trim() : "deepseek-v4-flash";

  return async (input) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const goalLabel = GOAL_LABELS[input.goalType] || input.goalType;
      const activityLabel = ACTIVITY_LABELS[input.activityLevel] || input.activityLevel;
      const sexLabel = input.sex === "female" ? "女" : input.sex === "male" ? "男" : "未说明";
      const avoidanceLabels = foodAvoidanceLabels(input.foodAvoidances);
      const avoidances = avoidanceLabels.length ? avoidanceLabels.join("、") : "无";
      const dietary = dietaryPatternLabel(input.dietaryPattern);
      const mealsRaw = Number(input.mealsPerDay);
      const mealsPerDay =
        Number.isFinite(mealsRaw) && mealsRaw >= 2 && mealsRaw <= 5 ? Math.round(mealsRaw) : 3;

      const response = await fetchImpl("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          thinking: { type: "disabled" },
          temperature: 0.2,
          max_tokens: 280,
          messages: [
            {
              role: "system",
              content:
                "你是注册营养师。根据用户身体数据、目标与饮食偏好，给出每日营养目标。" +
                "必须只返回 JSON，不要 markdown、解释或额外文字。字段：" +
                '{"calories":number,"proteinG":number,"carbsG":number,"fatG":number,"insight":string}。' +
                "规则：calories 为整数并尽量为 10 的倍数；proteinG/carbsG/fatG 为整数克；" +
                "proteinG*4 + carbsG*4 + fatG*9 必须接近 calories（误差≤5%）；" +
                "增肌略盈余、减脂适度缺口、维持接近 TDEE、运动表现略高碳水；" +
                "必须尊重饮食模式与忌口（如低碳降碳水、生酮高脂低碳、素食/纯素侧重植物蛋白）；" +
                "insight 用一句中文（≤40字）点明饮食模式、忌口或餐次中的关键依据，不要恐吓或减肥羞辱。",
            },
            {
              role: "user",
              content:
                `年龄${input.age}岁，生理性别${sexLabel}，身高${input.heightCm}cm，体重${input.weightKg}kg，` +
                `活动量${activityLabel}，每周训练约${input.trainingDays ?? 0}天，目标「${goalLabel}」，` +
                `饮食模式「${dietary}」，忌口「${avoidances}」，每日分 ${mealsPerDay} 餐安排。` +
                "请给出每日热量与三大营养素目标。",
            },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const data = await response.json();
      const parsed = extractJson(data?.choices?.[0]?.message?.content);
      if (!parsed) return null;
      return normalizePlan(parsed);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
}

module.exports = {
  PublicNutritionPlanError,
  createDeepseekNutritionPlanService,
  normalizePlan,
};
