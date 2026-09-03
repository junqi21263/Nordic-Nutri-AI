const http = require("node:http");
const { createHmac, timingSafeEqual } = require("node:crypto");

const MAX_BODY_BYTES = 8 * 1024;
const MAX_TEXT_LENGTH = 180;
const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;
const MODEL_GROUP = "hunyuan-exp";
const DEFAULT_MODEL = "hunyuan-2.0-instruct-20251111";
const FOOD_INSIGHT_SYSTEM_PROMPT = "你是 Nordic Nutri 的食物营养洞察编辑。foodContext 是唯一事实来源；只使用其中给出的食物名称、类别、形态和每100g营养数值。用普通成年人可理解的克制中文，说明食物特点、引用1至3项已给数值，并给一个日常搭配场景。不得补造营养素、疾病、药物、产地或功效；不得诊断、治疗或保证结果。只输出 JSON：{\\\"headline\\\":\\\"不超过28个字符\\\",\\\"content\\\":\\\"不超过180个字符\\\"}。";

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
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
  const content = boundedText(payload.content, MAX_TEXT_LENGTH);
  if (!headline || !content) throw new Error("WORKER_GENERATION_FAILED");
  return { headline, content };
}

function readRawJson(req) {
  return new Promise((resolve, reject) => {
    if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
      reject(new Error("WORKER_REQUEST_INVALID"));
      return;
    }
    let size = 0;
    let raw = "";
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        req.destroy();
        reject(new Error("WORKER_REQUEST_INVALID"));
        return;
      }
      raw += chunk;
    });
    req.on("end", () => {
      try {
        if (!raw) throw new Error("WORKER_REQUEST_INVALID");
        resolve({ raw, body: JSON.parse(raw) });
      } catch (error) {
        reject(error instanceof Error ? error : new Error("WORKER_REQUEST_INVALID"));
      }
    });
    req.on("error", reject);
  });
}

function hasValidSignature({ sharedSecret, timestamp, signature, rawBody, now }) {
  const timestampMs = Number(timestamp);
  if (!Number.isSafeInteger(timestampMs) || Math.abs(now - timestampMs) > SIGNATURE_MAX_AGE_MS || !sharedSecret || !signature) return false;
  const expected = createHmac("sha256", sharedSecret).update(`${timestamp}.${rawBody}`).digest("hex");
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(String(signature), "utf8");
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

function readWorkerConfig(env = process.env) {
  const envId = boundedText(env.TCB_ENV, 100);
  const sharedSecret = boundedText(env.AI_TEXT_WORKER_SHARED_SECRET, 256);
  if (!envId || !sharedSecret) throw new Error("Worker configuration is incomplete");
  return {
    envId,
    sharedSecret,
    cloudbaseApiKey: boundedText(env.CLOUDBASE_APIKEY, 4096),
    modelName: boundedText(env.HY_TEXT_MODEL, 100) || DEFAULT_MODEL,
  };
}

function createWorkerService(env = process.env, dependencies = {}) {
  const config = readWorkerConfig(env);
  const cloudbase = dependencies.cloudbaseNodeSdk ?? require("@cloudbase/node-sdk");
  const app = cloudbase.init({
    env: config.envId,
    ...(config.cloudbaseApiKey ? { accessKey: config.cloudbaseApiKey } : {}),
  });
  const ai = typeof app.ai === "function" ? app.ai() : app.ai;
  if (!ai || typeof ai.createModel !== "function") throw new Error("CloudBase AI client is unavailable");
  const model = ai.createModel(MODEL_GROUP);
  if (!model || typeof model.generateText !== "function") throw new Error("CloudBase text model is unavailable");
  return {
    sharedSecret: config.sharedSecret,
    async generate(foodContext) {
      const context = normalizeFoodContext(foodContext);
      const response = await model.generateText({
        model: config.modelName,
        temperature: 0.35,
        messages: [
          { role: "system", content: FOOD_INSIGHT_SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify({ foodContext: context }) },
        ],
      });
      const usage = (() => {
        const u = response?.usage;
        if (!u || typeof u !== "object") return null;
        const promptTokens = Number(u.prompt_tokens ?? u.input_tokens ?? u.promptTokens) || 0;
        const completionTokens = Number(u.completion_tokens ?? u.output_tokens ?? u.completionTokens) || 0;
        const totalTokens = Number(u.total_tokens ?? u.totalTokens) || (promptTokens + completionTokens);
        if (!promptTokens && !completionTokens && !totalTokens) return null;
        return { promptTokens, completionTokens, totalTokens };
      })();
      return { ...validateInsight(response?.text), source: MODEL_GROUP, model: config.modelName, usage };
    },
  };
}

function createWorkerHttpServer({ service, sharedSecret, now = () => Date.now() } = {}) {
  const secret = sharedSecret || service?.sharedSecret || "";
  return http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/generate") return sendJson(res, 405, { code: "METHOD_NOT_ALLOWED" });
    if (!service || !secret) return sendJson(res, 503, { code: "WORKER_NOT_CONFIGURED" });
    try {
      const { raw, body } = await readRawJson(req);
      if (!hasValidSignature({
        sharedSecret: secret,
        timestamp: req.headers["x-nordic-worker-timestamp"],
        signature: req.headers["x-nordic-worker-signature"],
        rawBody: raw,
        now: now(),
      })) return sendJson(res, 401, { code: "WORKER_UNAUTHORIZED" });
      return sendJson(res, 200, await service.generate(body?.foodContext));
    } catch (error) {
      const code = error?.message === "WORKER_REQUEST_INVALID" ? "WORKER_REQUEST_INVALID" : "WORKER_GENERATION_FAILED";
      return sendJson(res, code === "WORKER_REQUEST_INVALID" ? 400 : 503, { code });
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
    console.error("[nutrition-insight-worker] startup failed:", error?.message || error);
  }
  createWorkerHttpServer({ service, sharedSecret }).listen(9000);
}

module.exports = {
  createWorkerHttpServer,
  createWorkerService,
  hasValidSignature,
  normalizeFoodContext,
  readWorkerConfig,
};
