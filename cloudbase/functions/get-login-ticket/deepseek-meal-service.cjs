class PublicMealAnalysisError extends Error {
  constructor(code, message = "餐食分析暂不可用") {
    super(message);
    this.code = code;
  }
}

function invalid(message) {
  return new PublicMealAnalysisError("MEAL_ANALYSIS_INVALID", message);
}

function assertNumber(value, field) {
  if (!Number.isFinite(value) || value < 0 || value > 2000) throw invalid("分析结果无效");
}

function assertRequestedItems(input) {
  if (!Array.isArray(input?.items) || input.items.length < 1 || input.items.length > 20) throw invalid("食材无效");
  return input.items.map((item) => {
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    if (!name || name.length > 100 || !Number.isFinite(item.quantityG) || item.quantityG <= 0 || item.quantityG > 2000) {
      throw invalid("食材无效");
    }
    return { name, quantityG: item.quantityG };
  });
}

function parseCompletionPayload(payload) {
  if (typeof payload === "string") {
    try { return JSON.parse(payload); } catch { throw new PublicMealAnalysisError("MEAL_ANALYSIS_RETRYABLE"); }
  }
  if (!payload || typeof payload !== "object") throw new PublicMealAnalysisError("MEAL_ANALYSIS_RETRYABLE");
  return payload;
}

function validateCompletion(payload) {
  const result = parseCompletionPayload(payload);
  const mealName = typeof result.mealName === "string" ? result.mealName.trim() : "";
  if (!mealName || mealName.length > 100 || !Array.isArray(result.items) || result.items.length < 1 || result.items.length > 20) {
    throw invalid("分析结果无效");
  }
  const items = result.items.map((item) => {
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    if (!name || name.length > 100) throw invalid("分析结果无效");
    for (const field of ["quantityG", "caloriesPer100g", "proteinPer100g", "carbsPer100g", "fatPer100g"]) assertNumber(item[field], field);
    if (item.quantityG <= 0) throw invalid("分析结果无效");
    return {
      name,
      quantityG: item.quantityG,
      caloriesPer100g: item.caloriesPer100g,
      proteinPer100g: item.proteinPer100g,
      carbsPer100g: item.carbsPer100g,
      fatPer100g: item.fatPer100g,
    };
  });
  const advice = typeof result.advice === "string" ? result.advice.trim().slice(0, 1000) : "";
  return { mealName, advice, items };
}

function createDeepseekRequestCompletion({ apiKey, model, fetchImpl = globalThis.fetch }) {
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("DeepSeek configuration is incomplete");
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable");
  const selectedModel = typeof model === "string" && model.trim() ? model.trim() : "deepseek-v4-flash";
  return async ({ items }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12_000);
    try {
      const response = await fetchImpl("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          thinking: { type: "disabled" },
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [{
            role: "system",
            content: "你是营养估算助手。仅返回 JSON：mealName、advice、items。每个 items 含 name、quantityG、caloriesPer100g、proteinPer100g、carbsPer100g、fatPer100g。不得提供医疗诊断或治疗建议。",
          }, { role: "user", content: JSON.stringify({ items }) }],
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new PublicMealAnalysisError("MEAL_ANALYSIS_RETRYABLE");
      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      return parseCompletionPayload(content);
    } catch (error) {
      if (error instanceof PublicMealAnalysisError) throw error;
      throw new PublicMealAnalysisError("MEAL_ANALYSIS_RETRYABLE");
    } finally {
      clearTimeout(timer);
    }
  };
}

function createDeepseekMealService({ apiKey, model, requestCompletion, fetchImpl } = {}) {
  const complete = requestCompletion ?? createDeepseekRequestCompletion({ apiKey, model, fetchImpl });
  return async (input) => {
    const items = assertRequestedItems(input);
    const response = await complete({ items });
    return validateCompletion(response);
  };
}

module.exports = { createDeepseekMealService, PublicMealAnalysisError };
