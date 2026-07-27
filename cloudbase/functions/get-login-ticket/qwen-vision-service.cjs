/**
 * Qwen3-VL food recognition adapter.
 * The DashScope key stays in the cloud function environment; callers only
 * receive the normalized recognition result. A cheap flash pass is upgraded
 * to plus when the first pass reports uncertainty or a complex plate.
 */
class PublicQwenVisionError extends Error {
  constructor(code, message = "图片识别暂不可用") {
    super(message);
    this.code = code;
  }
}

const mealTypes = new Set(["breakfast", "lunch", "dinner", "snack"]);

function parsePayload(payload) {
  if (typeof payload === "string") {
    const cleaned = payload.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
    try { return JSON.parse(cleaned); } catch { throw new PublicQwenVisionError("VISION_RESULT_INVALID"); }
  }
  if (!payload || typeof payload !== "object") throw new PublicQwenVisionError("VISION_RESULT_INVALID");
  return payload;
}

function normalizeContent(content) {
  if (Array.isArray(content)) {
    return content.map((part) => typeof part === "string" ? part : part?.text ?? "").join("");
  }
  if (content && typeof content === "object" && typeof content.text === "string") return content.text;
  return content;
}

function validateResult(payload) {
  const result = parsePayload(normalizeContent(payload));
  // Non-food detection: model returns { "isFood": false } for non-food images
  if (result.isFood === false) {
    throw new PublicQwenVisionError("VISION_NON_FOOD", "上传的图片为非食物，请重新上传食物图片");
  }
  const mealName = typeof result.mealName === "string" ? result.mealName.trim() : "";
  if (!mealName || mealName.length > 100 || !mealTypes.has(result.mealType) || !Array.isArray(result.items) || !result.items.length || result.items.length > 20) {
    throw new PublicQwenVisionError("VISION_RESULT_INVALID");
  }
  const fields = ["quantityG", "caloriesPer100g", "proteinPer100g", "carbsPer100g", "fatPer100g"];
  const items = result.items.map((item) => {
    const name = typeof item?.name === "string" ? item.name.trim() : "";
    if (!name || name.length > 100 || fields.some((field) => !Number.isFinite(item[field]) || item[field] < 0 || item[field] > 2000) || item.quantityG <= 0) {
      throw new PublicQwenVisionError("VISION_RESULT_INVALID");
    }
    return Object.fromEntries([["name", name], ...fields.map((field) => [field, item[field]])]);
  });
  const reasons = Array.isArray(result.uncertaintyReasons)
    ? result.uncertaintyReasons.filter((item) => typeof item === "string").slice(0, 8)
    : [];
  return {
    mealName,
    mealType: result.mealType,
    confidence: Number.isFinite(result.confidence) ? Math.min(1, Math.max(0, result.confidence)) : 0,
    advice: typeof result.advice === "string" ? result.advice.trim().slice(0, 1000) : "",
    items,
    needsEscalation: result.needsEscalation === true,
    portionConfidence: Number.isFinite(result.portionConfidence) ? Math.min(1, Math.max(0, result.portionConfidence)) : 1,
    uncertaintyReasons: reasons,
  };
}

function shouldEscalate(result) {
  // Keep flash for most plates; only upgrade when the first pass is clearly weak.
  // Escalating on item count / any uncertainty often doubles latency and hits SCF timeout.
  return result.needsEscalation === true || result.confidence < 0.55 || result.portionConfidence < 0.5;
}

function createQwenRequestCompletion({ apiKey, workspaceId, model, timeoutMs = 18_000, fetchImpl = globalThis.fetch }) {
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("QWEN_API_KEY configuration is incomplete");
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable");
  const selectedModel = typeof model === "string" && model.trim() ? model.trim() : "qwen3-vl-flash";
  return async ({ imageUrl }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const headers = { authorization: `Bearer ${apiKey}`, "content-type": "application/json" };
      if (workspaceId) headers["X-DashScope-WorkSpace"] = workspaceId;
      const response = await fetchImpl("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", {
        method: "POST",
        headers,
        body: JSON.stringify({
          model: selectedModel,
          temperature: 0,
          messages: [{ role: "user", content: [
            { type: "image_url", image_url: { url: imageUrl } },
            { type: "text", text: "你是专业营养分析视觉模型。仅返回 JSON，不要 Markdown。第一步：判断图片是否为食物或饮品。如果不是食物/饮品（如风景、文字、物品、人物、截图等），返回 {\"isFood\": false}。如果是食物或饮品，识别餐食并估算每项营养。字段必须为 mealName、mealType(breakfast/lunch/dinner/snack)、confidence(0到1)、portionConfidence(0到1)、needsEscalation(boolean)、uncertaintyReasons(string数组)、advice、items。advice 必须用中文撰写，简明扼要，不超过100字。items 每项含 name、quantityG、caloriesPer100g、proteinPer100g、carbsPer100g、fatPer100g。低置信度、多菜混合、遮挡或分量不清时 needsEscalation=true。营养值是估算，不作医疗诊断。" },
          ] }],
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        let errBody = "";
        try { errBody = await response.text(); } catch {}
        console.error("[qwen] API error status:", response.status, "body:", errBody.slice(0, 500));
        throw new PublicQwenVisionError("VISION_RETRYABLE", `Qwen API ${response.status}: ${errBody.slice(0, 200)}`);
      }
      const data = await response.json();
      return data?.choices?.[0]?.message?.content;
    } catch (error) {
      if (error instanceof PublicQwenVisionError) throw error;
      console.error("[qwen] request error:", error?.message || error, error?.stack || "");
      throw new PublicQwenVisionError("VISION_RETRYABLE", error?.message || "Qwen request failed");
    } finally { clearTimeout(timer); }
  };
}

function createQwenVisionService({ apiKey, workspaceId, flashModel = "qwen3-vl-flash", plusModel = "qwen3-vl-plus", requestCompletion, fetchImpl } = {}) {
  const complete = requestCompletion ?? createQwenRequestCompletion({ apiKey, workspaceId, model: flashModel, timeoutMs: 18_000, fetchImpl });
  const plusComplete = requestCompletion ? requestCompletion : createQwenRequestCompletion({ apiKey, workspaceId, model: plusModel, timeoutMs: 12_000, fetchImpl });
  return async ({ imageUrl }) => {
    if (typeof imageUrl !== "string" || imageUrl.length > 30_000_000) throw new PublicQwenVisionError("VISION_IMAGE_INVALID", "图片无效");
    if (!/^https:\/\//i.test(imageUrl) && !/^data:image\//i.test(imageUrl)) throw new PublicQwenVisionError("VISION_IMAGE_INVALID", "图片无效");
    const first = validateResult(await complete({ imageUrl, model: flashModel }));
    // Data-URL payloads are already large; a second plus pass often exceeds the cloud timeout.
    const canEscalate = !/^data:image\//i.test(imageUrl) && shouldEscalate(first);
    const selected = canEscalate ? validateResult(await plusComplete({ imageUrl, model: plusModel })) : first;
    return { ...selected, provider: "qwen", model: canEscalate ? plusModel : flashModel };
  };
}

module.exports = { createQwenVisionService, PublicQwenVisionError, validateResult, shouldEscalate };
