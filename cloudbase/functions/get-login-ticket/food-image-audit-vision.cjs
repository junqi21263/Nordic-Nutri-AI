class FoodImageAuditVisionError extends Error {
  constructor(code, message = "旧图视觉复核暂不可用") {
    super(message);
    this.code = code;
  }
}

const VERDICTS = new Set(["pass", "needs_review", "fail"]);
const HAN_CHARACTER = /\p{Script=Han}/u;
const { extractContentAndUsage } = require("./model-usage.cjs");

function parseAuditPayload(payload) {
  if (typeof payload === "string") {
    const cleaned = payload.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try {
      return JSON.parse(cleaned);
    } catch {
      throw new FoodImageAuditVisionError("FOOD_IMAGE_AUDIT_RESULT_INVALID");
    }
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new FoodImageAuditVisionError("FOOD_IMAGE_AUDIT_RESULT_INVALID");
  }
  return payload;
}

function normalizeContent(content) {
  if (Array.isArray(content)) return content.map((part) => typeof part === "string" ? part : part?.text ?? "").join("");
  if (content && typeof content === "object" && typeof content.text === "string") return content.text;
  return content;
}

function validateAuditResult(payload) {
  const result = parseAuditPayload(normalizeContent(payload));
  const verdict = typeof result.verdict === "string" ? result.verdict.trim() : "";
  const detectedSubject = typeof result.detectedSubject === "string" ? result.detectedSubject.trim() : "";
  const confidence = result.confidence;
  const reasons = result.reasons;

  if (!VERDICTS.has(verdict)
    || !detectedSubject
    || detectedSubject.length > 120
    || !Number.isFinite(confidence)
    || confidence < 0
    || confidence > 1
    || !Array.isArray(reasons)
    || reasons.length > 5) {
    throw new FoodImageAuditVisionError("FOOD_IMAGE_AUDIT_RESULT_INVALID");
  }

  const normalizedReasons = reasons.map((reason) => {
    const value = typeof reason === "string" ? reason.trim() : "";
    if (!value || value.length > 160 || !HAN_CHARACTER.test(value)) {
      throw new FoodImageAuditVisionError("FOOD_IMAGE_AUDIT_RESULT_INVALID");
    }
    return value;
  });

  return { verdict, detectedSubject, confidence, reasons: normalizedReasons };
}

function validateInput(input) {
  if (typeof input?.imageUrl !== "string" || !/^https:\/\//i.test(input.imageUrl) || input.imageUrl.length > 2048) {
    throw new FoodImageAuditVisionError("FOOD_IMAGE_AUDIT_IMAGE_INVALID", "旧图地址无效");
  }
  const foodNameZh = typeof input.foodNameZh === "string" ? input.foodNameZh.trim() : "";
  const foodNameEn = typeof input.foodNameEn === "string" ? input.foodNameEn.trim() : "";
  const expectedVisualType = typeof input.expectedVisualType === "string" ? input.expectedVisualType.trim() : "";
  if ((!foodNameZh && !foodNameEn) || !expectedVisualType) {
    throw new FoodImageAuditVisionError("FOOD_IMAGE_AUDIT_INPUT_INVALID", "旧图审计参数无效");
  }
  const matchedKeywords = Array.isArray(input.matchedKeywords)
    ? input.matchedKeywords.filter((keyword) => typeof keyword === "string" && keyword.trim()).map((keyword) => keyword.trim()).slice(0, 20)
    : [];
  return { imageUrl: input.imageUrl, foodNameZh, foodNameEn, expectedVisualType, matchedKeywords };
}

function createFoodImageAuditRequestCompletion({ apiKey, workspaceId, model = "qwen3-vl-flash", endpoint = "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", timeoutMs = 18_000, maxTokens = 512, temperature = 0, fetchImpl = globalThis.fetch } = {}) {
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("QWEN_API_KEY configuration is incomplete");
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable");
  const selectedModel = typeof model === "string" && model.trim() ? model.trim() : "qwen3-vl-flash";

  return async ({ imageUrl, foodNameZh, foodNameEn, expectedVisualType, matchedKeywords }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = { authorization: `Bearer ${apiKey}`, "content-type": "application/json" };
      if (workspaceId) headers["X-DashScope-WorkSpace"] = workspaceId;
      const response = await fetchImpl(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: selectedModel,
          temperature: Number.isFinite(Number(temperature)) ? Number(temperature) : 0,
          max_tokens: Number.isInteger(Number(maxTokens)) && Number(maxTokens) > 0 ? Number(maxTokens) : 512,
          response_format: { type: "json_object" },
          messages: [{
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageUrl } },
              {
                type: "text",
                text: `你是食物图片旧图审计器。仅返回 JSON，不要 Markdown 或额外文字。比较图片主体是否符合预期食物视觉形态。食物中文名：${foodNameZh || "未提供"}；英文名：${foodNameEn || "未提供"}；预期视觉类型：${expectedVisualType}；命中形态词：${matchedKeywords.join("、") || "未提供"}。只返回 verdict(pass/needs_review/fail)、detectedSubject、confidence(0到1) 与 reasons。reasons 必须是最多 5 条简短中文理由。加工食品必须判断最终食用形态，风味或原材料词不是画面主体。`,
              },
            ],
          }],
        }),
        signal: controller.signal,
      });
      if (!response.ok) throw new FoodImageAuditVisionError("FOOD_IMAGE_AUDIT_VISION_RETRYABLE");
      const parsed = extractContentAndUsage(await response.json());
      return { content: parsed.content, usage: parsed.usage, model: selectedModel };
    } catch (error) {
      if (error instanceof FoodImageAuditVisionError) throw error;
      throw new FoodImageAuditVisionError("FOOD_IMAGE_AUDIT_VISION_RETRYABLE");
    } finally {
      clearTimeout(timer);
    }
  };
}

function unwrapCompletion(raw) {
  if (typeof raw === "string") return { content: raw, usage: null };
  if (raw && typeof raw === "object" && Object.hasOwn(raw, "content")) return { content: raw.content, usage: raw.usage ?? null };
  return { content: raw, usage: null };
}

function createFoodImageAuditVision({ apiKey, workspaceId, model = "qwen3-vl-flash", endpoint, timeoutMs, maxTokens, temperature, requestCompletion, fetchImpl } = {}) {
  const complete = requestCompletion ?? createFoodImageAuditRequestCompletion({ apiKey, workspaceId, model, endpoint, timeoutMs, maxTokens, temperature, fetchImpl });
  return async (input) => {
    const request = validateInput(input);
    try {
      const raw = unwrapCompletion(await complete(request));
      return validateAuditResult(raw.content);
    } catch (error) {
      if (error instanceof FoodImageAuditVisionError) throw error;
      throw new FoodImageAuditVisionError("FOOD_IMAGE_AUDIT_VISION_RETRYABLE");
    }
  };
}

module.exports = {
  createFoodImageAuditVision,
  createFoodImageAuditRequestCompletion,
  validateAuditResult,
  FoodImageAuditVisionError,
};
