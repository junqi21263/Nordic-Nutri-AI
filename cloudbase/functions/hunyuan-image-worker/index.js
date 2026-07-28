const http = require("node:http");
const { createHmac, timingSafeEqual } = require("node:crypto");

const MAX_BODY_BYTES = 8 * 1024;
const MAX_PROMPT_CHARS = 500;
const SIGNATURE_MAX_AGE_MS = 5 * 60 * 1000;
const DEFAULT_MODEL = "HY-Image-3.0-Plus-4090-Tob-v1.0";
const DEFAULT_SIZE = "1280x720";
const ALLOWED_SIZES = new Set(["1024x1024", "1280x720", "720x1280", "1280x1280"]);

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
  };
}

function createWorkerService(env = process.env, dependencies = {}) {
  const config = readWorkerConfig(env);
  const cloudbase = dependencies.cloudbaseNodeSdk ?? require("@cloudbase/node-sdk");
  const app = cloudbase.init({ env: config.envId });
  const ai = typeof app.ai === "function" ? app.ai() : app.ai;
  if (!ai || typeof ai.createImageModel !== "function") throw new Error("Hunyuan image SDK is unavailable");
  const imageModel = ai.createImageModel("hunyuan-image");

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
  };
}

function createWorkerHttpServer({ service, sharedSecret, now = () => Date.now() } = {}) {
  const secret = sharedSecret || service?.sharedSecret || "";
  return http.createServer(async (req, res) => {
    if (req.method !== "POST" || req.url !== "/generate") {
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
      const result = await service.generate({
        prompt: body?.prompt,
        size: body?.size,
        seed: body?.seed,
      });
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
};
