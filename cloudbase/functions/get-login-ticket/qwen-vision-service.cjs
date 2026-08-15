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

const { extractContentAndUsage } = require("./model-usage.cjs");
const { VISION_BUDGETS } = require("./vision-budget.cjs");

const FLASH_MAX_TIMEOUT_MS = VISION_BUDGETS.flashMaxMs;
const PLUS_MAX_TIMEOUT_MS = VISION_BUDGETS.plusMaxMs;
const DOWNSTREAM_MANDATORY_RESERVE_MS = VISION_BUDGETS.nutritionReserveMs
  + VISION_BUDGETS.evaluationReserveMs
  + VISION_BUDGETS.persistenceReserveMs;

function createQwenRequestCompletion({ apiKey, workspaceId, model, timeoutMs = 18_000, fetchImpl = globalThis.fetch }) {
  if (typeof apiKey !== "string" || !apiKey.trim()) throw new Error("QWEN_API_KEY configuration is incomplete");
  if (typeof fetchImpl !== "function") throw new Error("Fetch is unavailable");
  const selectedModel = typeof model === "string" && model.trim() ? model.trim() : "qwen3-vl-flash";
  return async ({ imageUrl, timeoutMs: requestTimeoutMs }) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1, Number(requestTimeoutMs) || timeoutMs));
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
            { type: "text", text: "你是专业营养分析视觉模型。仅返回 JSON，不要 Markdown。第一步判断图片是否为食物或饮品；若是风景、文字、物品、人物或截图，返回 {\"isFood\": false}。对食物图从左到右、前到后按餐盘区域逐区观察，枚举所有清晰可见的独立菜品；主动区分主食、蛋白质、蔬菜、配菜、酱汁和饮品，不能因为一个区域遮挡就遗漏其他区域。只报告图中可见或有充分视觉依据的食物，不猜测完全不可见的食材；对遮挡、混合、火锅、便当和多拼盘场景，在 uncertaintyReasons 中写明不确定项，并给出合理份量估算，不要为了追求绝对确定而持续重试。字段必须为 mealName、mealType(breakfast/lunch/dinner/snack)、confidence(0到1)、portionConfidence(0到1)、needsEscalation(boolean)、uncertaintyReasons(string数组)、advice、items。advice 必须用中文撰写，简明扼要，不超过100字。items 每项含 name、quantityG、caloriesPer100g、proteinPer100g、carbsPer100g、fatPer100g；营养值是估算，不作医疗诊断。" },
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
      const parsed = extractContentAndUsage(data);
      return { content: parsed.content, usage: parsed.usage, model: selectedModel };
    } catch (error) {
      if (error instanceof PublicQwenVisionError) throw error;
      console.error("[qwen] request error:", error?.message || error, error?.stack || "");
      if (error?.name === "AbortError" || String(error?.message || "").toLowerCase().includes("aborted")) {
        throw new PublicQwenVisionError("VISION_TIMEOUT", "识别时间有点久，请重新试一次");
      }
      throw new PublicQwenVisionError("VISION_RETRYABLE", error?.message || "Qwen request failed");
    } finally { clearTimeout(timer); }
  };
}

function mergeUsage(left, right) {
  if (!left && !right) return null;
  return {
    promptTokens: (left?.promptTokens || 0) + (right?.promptTokens || 0),
    completionTokens: (left?.completionTokens || 0) + (right?.completionTokens || 0),
    totalTokens: (left?.totalTokens || 0) + (right?.totalTokens || 0),
  };
}

function unwrapVisionCompletion(raw) {
  if (typeof raw === "string") return { content: raw, usage: null };
  if (raw && typeof raw === "object") {
    if ("content" in raw && !("mealName" in raw) && !("isFood" in raw) && !("items" in raw)) {
      return { content: raw.content, usage: raw.usage || null };
    }
    return { content: raw, usage: raw.usage || null };
  }
  return { content: raw, usage: null };
}

function createQwenVisionService({ apiKey, workspaceId, flashModel = "qwen3-vl-flash", plusModel = "qwen3-vl-plus", requestCompletion, fetchImpl } = {}) {
  const complete = requestCompletion ?? createQwenRequestCompletion({ apiKey, workspaceId, model: flashModel, timeoutMs: 18_000, fetchImpl });
  const plusComplete = requestCompletion ? requestCompletion : createQwenRequestCompletion({ apiKey, workspaceId, model: plusModel, timeoutMs: 10_000, fetchImpl });
  return async ({ imageUrl, budget, observe = () => {} }) => {
    if (typeof imageUrl !== "string" || imageUrl.length > 30_000_000) throw new PublicQwenVisionError("VISION_IMAGE_INVALID", "图片无效");
    if (!/^https:\/\//i.test(imageUrl) && !/^data:image\//i.test(imageUrl)) throw new PublicQwenVisionError("VISION_IMAGE_INVALID", "图片无效");
    const flashTimeoutMs = budget?.stageTimeout
      ? budget.stageTimeout(FLASH_MAX_TIMEOUT_MS, 0)
      : FLASH_MAX_TIMEOUT_MS;
    if (flashTimeoutMs <= 0) throw new PublicQwenVisionError("VISION_TIMEOUT", "图片识别超时，请重试");
    const flashStartedAt = Date.now();
    let firstRaw;
    try {
      firstRaw = unwrapVisionCompletion(await complete({ imageUrl, model: flashModel, timeoutMs: flashTimeoutMs }));
    } catch (error) {
      observe({ stage: "flash", ms: Date.now() - flashStartedAt, flashSuccess: false, abortReason: classifyAbortReason(error) });
      throw error;
    }
    observe({ stage: "flash", ms: Date.now() - flashStartedAt, flashSuccess: true });
    const first = validateResult(firstRaw.content);
    let usage = firstRaw.usage;
    // Data-URL payloads are already large; a second plus pass often exceeds the cloud timeout.
    let canEscalate = !/^data:image\//i.test(imageUrl) && shouldEscalate(first);
    let plusTimeoutMs = PLUS_MAX_TIMEOUT_MS;
    let plusSkipReason = null;
    if (canEscalate && budget?.remainingAfterReserve) {
      plusTimeoutMs = Math.min(PLUS_MAX_TIMEOUT_MS, budget.remainingAfterReserve(DOWNSTREAM_MANDATORY_RESERVE_MS));
      if (plusTimeoutMs <= 0) {
        canEscalate = false;
        plusSkipReason = "insufficient_budget";
      }
    }
    if (!canEscalate) {
      observe({ stage: "plus", plusAttempted: false, plusSkipReason: plusSkipReason || (/^data:image\//i.test(imageUrl) ? "data_url" : "not_needed") });
    }
    let selected = first;
    if (canEscalate) {
      observe({ stage: "plus", plusAttempted: true });
      const plusStartedAt = Date.now();
      try {
        const plusRaw = unwrapVisionCompletion(await plusComplete({ imageUrl, model: plusModel, timeoutMs: plusTimeoutMs }));
        const validatedPlus = validateResult(plusRaw.content);
        selected = validatedPlus;
        usage = mergeUsage(usage, plusRaw.usage);
        observe({ stage: "plus", ms: Date.now() - plusStartedAt, plusSuccess: true });
      } catch (error) {
        observe({
          stage: "plus",
          ms: Date.now() - plusStartedAt,
          plusSuccess: false,
          fallbackToFlash: true,
          fallbackReason: classifyPlusFailure(error),
        });
      }
    }
    return { ...selected, provider: "qwen", model: selected === first ? flashModel : plusModel, usage, modelHops: selected === first ? 1 : 2 };
  };
}

function classifyAbortReason(error) {
  const text = String(error?.message || "").toLowerCase();
  if (error?.name === "AbortError" || text.includes("aborted") || text.includes("timeout")) return "timeout";
  return null;
}

function classifyPlusFailure(error) {
  const text = String(error?.message || "").toLowerCase();
  if (error?.name === "AbortError" || text.includes("aborted")) return "plus_abort";
  if (text.includes("timeout") || error?.code === "VISION_TIMEOUT") return "plus_timeout";
  if (error?.code === "VISION_RESULT_INVALID") return "plus_invalid_result";
  return "plus_error";
}

module.exports = { createQwenVisionService, PublicQwenVisionError, validateResult, shouldEscalate };
