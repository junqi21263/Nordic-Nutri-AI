const http = require("node:http");
const { createHmac, timingSafeEqual } = require("node:crypto");

const MAX_BODY_BYTES = 8 * 1024;
const MAX_PROMPT_CHARS = 500;
const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;
const DEFAULT_MODEL = "HY-Image-3.0-Plus-4090-Tob-v1.0";
const DEFAULT_TEXT_MODEL = "hunyuan-2.0-instruct-20251111";
const DEFAULT_SIZE = "1280x720";
const ALLOWED_SIZES = new Set(["1024x1024", "1280x720", "720x1280", "1280x1280"]);
const FOOD_INSIGHT_SYSTEM_PROMPT = "你是 Nordic Nutri 的食物营养洞察编辑。foodContext 是唯一事实来源；只使用其中给出的食物名称、类别、形态和每100g营养数值。用普通成年人可理解的克制中文，说明食物特点、引用1至3项已给数值，并给一个日常搭配场景。不得补造营养素、疾病、药物、产地或功效；不得诊断、治疗或保证结果。输出约束：只输出 JSON；禁止 Markdown、双星号加粗、反引号、标题符号，以及“回复：”“答复：”“回答：”“建议：”“说明：”等前缀。字段值必须是可直接展示的纯文本：{\\\"headline\\\":\\\"不超过28个字符\\\",\\\"content\\\":\\\"不超过180个字符\\\"}。";
const DAILY_INSIGHT_SYSTEM_PROMPT = "你是 Nordic Nutri 的每日营养洞察编辑。只依据 nutritionContext 给普通成年人一条当天建议。只选择一个最优先方向，引用已给出的记录或目标，并给出下一餐的可执行动作。不得编造饮食、训练或健康情况；不得诊断、治疗、开药或保证结果。输出约束：只输出 JSON；禁止 Markdown、双星号加粗、反引号、标题符号，以及“回复：”“答复：”“回答：”“建议：”“说明：”等前缀。字段值必须是可直接展示的纯文本：{\\\"focus\\\":\\\"protein|carbs|fat|calories|fiber|regularity|variety\\\",\\\"headline\\\":\\\"不超过32个字符\\\",\\\"content\\\":\\\"不超过180个字符\\\"}。";
const DAILY_TIP_SYSTEM_PROMPT = "你是 Nordic Nutri 的日常营养内容编辑。只依据 nutritionContext 和 tipType，为普通成年人生成一条当天可执行的中文建议。nutrition_tip 围绕当天缺口给出下一餐或加餐；food_function 解释常见食物特点与搭配；food_knowledge 解释标签、营销话术或选购误区。不要做品牌广告、疾病建议、治疗承诺或医疗替代。输出约束：只输出 JSON；禁止 Markdown、双星号加粗、反引号、标题符号，以及“回复：”“答复：”“回答：”“建议：”“说明：”等前缀。字段值必须是可直接展示的纯文本：{\\\"type\\\":\\\"nutrition_tip|food_function|food_knowledge\\\",\\\"headline\\\":\\\"不超过32个字符\\\",\\\"content\\\":\\\"不超过120个字符\\\",\\\"reason\\\":\\\"不超过30个字符，说明当前推荐依据\\\",\\\"food\\\":null或{\\\"name\\\":\\\"食物名\\\",\\\"proteinG\\\":数字}}。";
const COACH_QUICK_PROMPT_SYSTEM_PROMPT = "你是 Nordic Nutri 的营养教练。只依据 nutritionContext 生成一条用户可一键发送的中文营养问题。问题须包含餐次或场景、营养目标或限制中的至少一个具体锚点；只问一个问题，以中文问号结尾。不要问候、不要泛泛而谈、不要医疗或疾病内容。输出约束：只输出 JSON；禁止 Markdown、双星号加粗、反引号、标题符号，以及“回复：”“答复：”“回答：”“建议：”“说明：”等前缀。问题字段必须是可直接发送的纯文本：{\\\"prompt\\\":\\\"不超过28个字符的问题\\\"}。";
const DAILY_TIP_TYPES = new Set(["nutrition_tip", "food_function", "food_knowledge"]);
const FORBIDDEN_PRESENTATION_PATTERN = /```|[`*#]|^\s*(?:回复|答复|回答|建议|说明)\s*[:：]/m;

function extractWorkerUsage(payload) {
  if (!payload || typeof payload !== "object") return null;
  const usage = payload.usage;
  if (usage && typeof usage === "object") {
    const promptTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokens ?? usage.inputTokens) || 0;
    const completionTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? usage.completionTokens ?? usage.outputTokens) || 0;
    const totalTokens = Number(usage.total_tokens ?? usage.totalTokens) || (promptTokens + completionTokens);
    if (promptTokens || completionTokens || totalTokens) {
      return { promptTokens, completionTokens, totalTokens };
    }
  }
  if (payload.rawResponse && typeof payload.rawResponse === "object") {
    const nested = extractWorkerUsage(payload.rawResponse);
    if (nested) return nested;
  }
  if (Array.isArray(payload.rawResponses)) {
    for (let i = payload.rawResponses.length - 1; i >= 0; i -= 1) {
      const nested = extractWorkerUsage(payload.rawResponses[i]);
      if (nested) return nested;
    }
  }
  const promptTokens = Number(payload.promptTokens ?? payload.prompt_tokens) || 0;
  const completionTokens = Number(payload.completionTokens ?? payload.completion_tokens) || 0;
  const totalTokens = Number(payload.totalTokens ?? payload.total_tokens) || (promptTokens + completionTokens);
  if (!promptTokens && !completionTokens && !totalTokens) return null;
  return { promptTokens, completionTokens, totalTokens };
}

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
}

function readRawJson(req) {
  return new Promise((resolve, reject) => {
    const contentType = String(req.headers["content-type"] || "").toLowerCase();
    if (!contentType.startsWith("application/json")) {
      reject(new Error("REQUEST_INVALID"));
      return;
    }
    let size = 0;
    let raw = "";
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error("REQUEST_TOO_LARGE"));
        return;
      }
      raw += chunk;
    });
    req.on("end", () => {
      try {
        if (!raw) throw new Error("REQUEST_INVALID");
        resolve({ raw, body: JSON.parse(raw) });
      } catch (error) {
        reject(error instanceof Error ? error : new Error("REQUEST_INVALID"));
      }
    });
    req.on("error", reject);
  });
}

function hasValidSignature({ sharedSecret, timestamp, signature, rawBody, now }) {
  const timestampMs = Number(timestamp);
  if (!Number.isSafeInteger(timestampMs) || Math.abs(now - timestampMs) > SIGNATURE_MAX_AGE_MS) return false;
  if (!signature || !sharedSecret) return false;
  const expected = createHmac("sha256", sharedSecret).update(`${timestamp}.${rawBody}`).digest("hex");
  const received = Buffer.from(String(signature), "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return received.length === expectedBuffer.length && timingSafeEqual(received, expectedBuffer);
}

function boundedText(value, maxLength) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= maxLength ? text : null;
}

function safeNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 100000 ? Math.round(number * 10) / 10 : null;
}

function normalizeFoodContext(input) {
  const name = boundedText(input?.name, 100);
  const nutrition = input?.nutritionPer100g;
  if (!name || !nutrition || typeof nutrition !== "object" || Array.isArray(nutrition)) throw new Error("WORKER_REQUEST_INVALID");
  return {
    name,
    category: boundedText(input.category, 60),
    foodForm: boundedText(input.foodForm, 60),
    nutritionPer100g: {
      caloriesKcal: safeNumber(nutrition.caloriesKcal),
      proteinG: safeNumber(nutrition.proteinG),
      carbsG: safeNumber(nutrition.carbsG),
      fatG: safeNumber(nutrition.fatG),
      fiberG: safeNumber(nutrition.fiberG),
      sugarG: safeNumber(nutrition.sugarG),
      sodiumMg: safeNumber(nutrition.sodiumMg),
    },
  };
}

function validateInsight(value) {
  let payload = value;
  try {
    if (typeof payload === "string") payload = JSON.parse(payload);
  } catch {
    throw new Error("WORKER_GENERATION_FAILED");
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("WORKER_GENERATION_FAILED");
  const headline = boundedText(payload.headline, 28);
  const content = boundedText(payload.content, 180);
  if (!headline || !content) throw new Error("WORKER_GENERATION_FAILED");
  return { headline, content };
}

function plainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeContentContext(value) {
  if (!plainObject(value)) throw new Error("WORKER_REQUEST_INVALID");
  return value;
}

function normalizeDailyInsightInput(input) {
  const date = boundedText(input?.date, 10);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("WORKER_REQUEST_INVALID");
  return { date, context: normalizeContentContext(input.context) };
}

function normalizeDailyTipInput(input) {
  const type = boundedText(input?.type, 24);
  if (!type || !DAILY_TIP_TYPES.has(type)) throw new Error("WORKER_REQUEST_INVALID");
  return { type, context: normalizeContentContext(input.context) };
}

function normalizeCoachQuickPromptInput(input) {
  return { context: normalizeContentContext(input?.context) };
}

function parseStructuredText(value) {
  if (typeof value !== "string") throw new Error("WORKER_GENERATION_FAILED");
  try {
    const parsed = JSON.parse(value);
    if (!plainObject(parsed)) throw new Error("WORKER_GENERATION_FAILED");
    return parsed;
  } catch (error) {
    if (error?.message === "WORKER_GENERATION_FAILED") throw error;
    throw new Error("WORKER_GENERATION_FAILED");
  }
}

function readWorkerConfig(env) {
  const envId = typeof env.TCB_ENV === "string" ? env.TCB_ENV.trim() : "";
  const sharedSecret = typeof env.AI_WORKER_SHARED_SECRET === "string" ? env.AI_WORKER_SHARED_SECRET.trim() : "";
  if (!envId || !sharedSecret) throw new Error("Worker configuration is incomplete");
  const modelName = typeof env.HY_IMAGE_MODEL === "string" && env.HY_IMAGE_MODEL.trim()
    ? env.HY_IMAGE_MODEL.trim()
    : DEFAULT_MODEL;
  const requestedSize = typeof env.HY_IMAGE_SIZE === "string" ? env.HY_IMAGE_SIZE.trim() : "";
  return {
    envId,
    sharedSecret,
    modelName,
    size: ALLOWED_SIZES.has(requestedSize) ? requestedSize : DEFAULT_SIZE,
    textModelName: typeof env.HY_TEXT_MODEL === "string" && env.HY_TEXT_MODEL.trim()
      ? env.HY_TEXT_MODEL.trim()
      : DEFAULT_TEXT_MODEL,
  };
}

function createWorkerService(env = process.env, dependencies = {}) {
  const config = readWorkerConfig(env);
  const cloudbase = dependencies.cloudbaseNodeSdk ?? require("@cloudbase/node-sdk");
  const app = cloudbase.init({ env: config.envId });
  const ai = typeof app.ai === "function" ? app.ai() : app.ai;
  if (!ai || typeof ai.createImageModel !== "function" || typeof ai.createModel !== "function") throw new Error("Hunyuan AI SDK is unavailable");
  const imageModel = ai.createImageModel("hunyuan-image");
  const textModel = ai.createModel("hunyuan-exp");
  const generateStructuredText = async ({ system, payload }) => {
    const result = await textModel.generateText({
      model: config.textModelName,
      temperature: 0.35,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(payload) },
      ],
    });
    const parsed = parseStructuredText(result?.text);
    const serialized = JSON.stringify(parsed);
    if (FORBIDDEN_PRESENTATION_PATTERN.test(serialized)) throw new Error("WORKER_GENERATION_FAILED");
    const usage = extractWorkerUsage(result);
    return { ...parsed, source: "hunyuan-exp", model: config.textModelName, usage };
  };

  return {
    sharedSecret: config.sharedSecret,
    async generate(input) {
      const prompt = typeof input?.prompt === "string" ? input.prompt.trim() : "";
      if (!prompt || prompt.length > MAX_PROMPT_CHARS) throw new Error("WORKER_REQUEST_INVALID");
      const payload = {
        model: config.modelName,
        prompt,
        size: ALLOWED_SIZES.has(input?.size) ? input.size : config.size,
        revise: { value: false },
      };
      if (Number.isInteger(input?.seed) && input.seed > 0) payload.seed = input.seed;
      const result = await imageModel.generateImage(payload);
      const item = Array.isArray(result?.data) ? result.data[0] : null;
      const url = typeof item?.url === "string" ? item.url.trim() : "";
      if (!url.startsWith("https://")) throw new Error("WORKER_IMAGE_EMPTY");
      return {
        data: [{
          url,
          ...(typeof item.revised_prompt === "string" ? { revised_prompt: item.revised_prompt } : {}),
        }],
      };
    },
    async generateInsight(input) {
      const foodContext = normalizeFoodContext(input);
      const result = await generateStructuredText({ system: FOOD_INSIGHT_SYSTEM_PROMPT, payload: { foodContext } });
      return { ...validateInsight(result), source: result.source, model: result.model, usage: result.usage || null };
    },
    async generateDailyInsight(input) {
      const payload = normalizeDailyInsightInput(input);
      return generateStructuredText({ system: DAILY_INSIGHT_SYSTEM_PROMPT, payload: { date: payload.date, nutritionContext: payload.context } });
    },
    async generateDailyTip(input) {
      const payload = normalizeDailyTipInput(input);
      return generateStructuredText({ system: DAILY_TIP_SYSTEM_PROMPT, payload: { tipType: payload.type, nutritionContext: payload.context } });
    },
    async generateCoachQuickPrompt(input) {
      const payload = normalizeCoachQuickPromptInput(input);
      return generateStructuredText({ system: COACH_QUICK_PROMPT_SYSTEM_PROMPT, payload: { nutritionContext: payload.context } });
    },
  };
}

function createWorkerHttpServer({ service, sharedSecret, now = () => Date.now() } = {}) {
  const secret = sharedSecret || service?.sharedSecret || "";
  return http.createServer(async (req, res) => {
    const imageRoute = req.url === "/generate";
    const insightRoute = req.url === "/nutrition-insight";
    const dailyInsightRoute = req.url === "/daily-insight";
    const dailyTipRoute = req.url === "/daily-tip";
    const coachQuickPromptRoute = req.url === "/coach-quick-prompt";
    if (req.method !== "POST" || (!imageRoute && !insightRoute && !dailyInsightRoute && !dailyTipRoute && !coachQuickPromptRoute)) {
      sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
      return;
    }
    if (!service || !secret) {
      sendJson(res, 503, { code: "WORKER_NOT_CONFIGURED" });
      return;
    }
    try {
      const { raw, body } = await readRawJson(req);
      const isAuthorized = hasValidSignature({
        sharedSecret: secret,
        timestamp: req.headers["x-nordic-worker-timestamp"],
        signature: req.headers["x-nordic-worker-signature"],
        rawBody: raw,
        now: now(),
      });
      if (!isAuthorized) {
        sendJson(res, 401, { code: "WORKER_UNAUTHORIZED" });
        return;
      }
      const result = imageRoute
        ? await service.generate({ prompt: body?.prompt, size: body?.size, seed: body?.seed })
        : insightRoute
          ? await service.generateInsight(body?.foodContext)
          : dailyInsightRoute
            ? await service.generateDailyInsight({ date: body?.date, context: body?.context })
            : dailyTipRoute
              ? await service.generateDailyTip({ type: body?.type, context: body?.context })
              : await service.generateCoachQuickPrompt({ context: body?.context });
      sendJson(res, 200, result);
    } catch (error) {
      const code = error?.message === "WORKER_REQUEST_INVALID" || error?.message === "REQUEST_INVALID" || error?.message === "REQUEST_TOO_LARGE"
        ? "WORKER_REQUEST_INVALID"
        : "WORKER_GENERATION_FAILED";
      sendJson(res, code === "WORKER_REQUEST_INVALID" ? 400 : 503, { code });
    }
  });
}

if (require.main === module) {
  let service = null;
  let sharedSecret = "";
  try {
    service = createWorkerService();
    sharedSecret = service.sharedSecret;
  } catch (error) {
    console.error("[hunyuan-image-worker] startup failed:", error?.message || error);
  }
  createWorkerHttpServer({ service, sharedSecret }).listen(9000);
}

module.exports = {
  createWorkerHttpServer,
  createWorkerService,
  readWorkerConfig,
  hasValidSignature,
  normalizeFoodContext,
  extractWorkerUsage,
};
