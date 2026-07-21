class PublicVisionError extends Error {
  constructor(code, message = "图片识别暂不可用") {
    super(message);
    this.code = code;
  }
}

const mealTypes = new Set(["breakfast", "lunch", "dinner", "snack"]);

function parsePayload(payload) {
  if (typeof payload === "string") {
    const cleaned = payload.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try { return JSON.parse(cleaned); } catch { throw new PublicVisionError("VISION_RESULT_INVALID"); }
  }
  if (!payload || typeof payload !== "object") throw new PublicVisionError("VISION_RESULT_INVALID");
  return payload;
}

function validateResult(payload) {
  const result = parsePayload(payload);
  const mealName = typeof result.mealName === "string" ? result.mealName.trim() : "";
  if (!mealName || mealName.length > 100 || !mealTypes.has(result.mealType) || !Array.isArray(result.items) || !result.items.length || result.items.length > 20) {
    throw new PublicVisionError("VISION_RESULT_INVALID");
  }
  const items = result.items.map((item) => {
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    const fields = ["quantityG", "caloriesPer100g", "proteinPer100g", "carbsPer100g", "fatPer100g"];
    if (!name || name.length > 100 || fields.some((field) => !Number.isFinite(item[field]) || item[field] < 0 || item[field] > 2000) || item.quantityG <= 0) {
      throw new PublicVisionError("VISION_RESULT_INVALID");
    }
    return Object.fromEntries([["name", name], ...fields.map((field) => [field, item[field]])]);
  });
  return {
    mealName,
    mealType: result.mealType,
    confidence: Number.isFinite(result.confidence) ? Math.min(1, Math.max(0, result.confidence)) : 0,
    advice: typeof result.advice === "string" ? result.advice.trim().slice(0, 1000) : "",
    items,
  };
}

function createVitaRequestCompletion({ apiKey, model, fetchImpl = globalThis.fetch }) {
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("VITA configuration is incomplete");
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable");
  const selectedModel = typeof model === "string" && model.trim() ? model.trim() : "vita-video-3.0";
  return async ({ imageUrl }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetchImpl("https://api.vita.cloud.tencent.com/v1/video2text/chat/completions", {
        method: "POST",
        headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          temperature: 0,
          messages: [{
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageUrl } },
              { type: "text", text: "识别图片中的餐食。仅返回 JSON：mealName、mealType(breakfast/lunch/dinner/snack)、confidence(0到1)、advice、items；items 每项含 name、quantityG、caloriesPer100g、proteinPer100g、carbsPer100g、fatPer100g。营养数值为估算，不提供医疗诊断。" },
            ],
          }],
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new PublicVisionError("VISION_RETRYABLE");
      const data = await response.json();
      return data?.choices?.[0]?.message?.content;
    } catch (error) {
      if (error instanceof PublicVisionError) throw error;
      throw new PublicVisionError("VISION_RETRYABLE");
    } finally {
      clearTimeout(timer);
    }
  };
}

function createVitaVisionService({ apiKey, model, requestCompletion, fetchImpl } = {}) {
  const complete = requestCompletion ?? createVitaRequestCompletion({ apiKey, model, fetchImpl });
  return async (input) => {
    if (typeof input?.imageUrl !== "string" || !/^https:\/\//i.test(input.imageUrl) || input.imageUrl.length > 2048) {
      throw new PublicVisionError("VISION_IMAGE_INVALID", "图片无效");
    }
    return validateResult(await complete({ imageUrl: input.imageUrl }));
  };
}

module.exports = { createVitaVisionService, PublicVisionError };
