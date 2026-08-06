/**
 * DeepSeek meal evaluation service.
 * Generates a short Chinese evaluation headline for a recognized meal.
 */

const { extractContentAndUsage } = require("./model-usage.cjs");

function createDeepseekEvaluationService({ apiKey, model, fetchImpl = globalThis.fetch } = {}) {
  if (typeof apiKey !== "string" || !apiKey.trim()) return null;
  if (typeof fetchImpl !== "function") return null;
  const selectedModel = typeof model === "string" && model.trim() ? model.trim() : "deepseek-v4-flash";
  return async ({ mealName, mealType, items, confidence }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_500);
    try {
      const itemList = items.map((i) => `${i.name} ${i.quantityG}g`).join("、");
      const response = await fetchImpl("https://api.deepseek.com/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          thinking: { type: "disabled" },
          temperature: 0.3,
          max_tokens: 60,
          messages: [{
            role: "system",
            content: '你是营养评价助手。根据识别到的餐食，用中文给出一句简短评价（不超过15个字），如「这餐吃得不错」「蛋白质很扎实」等。只返回评价文字，不要引号或其他内容。',
          }, {
            role: "user",
            content: `餐食：${mealName}（${mealType}），食材：${itemList}，置信度：${Math.round((confidence || 0) * 100)}%`,
          }],
        }),
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const data = await response.json();
      const parsed = extractContentAndUsage(data);
      if (typeof parsed.content !== "string") return null;
      const evaluation = parsed.content.trim().replace(/^["'""]|["'""]$/g, "").slice(0, 20);
      if (!evaluation) return null;
      return { evaluation, usage: parsed.usage, model: selectedModel };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };
}

module.exports = { createDeepseekEvaluationService };
