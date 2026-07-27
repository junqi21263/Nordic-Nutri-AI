// hunyuan-image-service.cjs
// Server-only Hunyuan image generation via @cloudbase/node-sdk ai.createImageModel.
// Temporary URLs (24h) are downloaded immediately and must be persisted to Storage
// by the caller — never stored as the permanent food image URL.

const https = require("node:https");
const { buildFoodImagePrompt, MAX_PROMPT_CHARS } = require("./food-image-prompts.cjs");

const DEFAULT_MODEL = "HY-Image-3.0-Plus-4090-Tob-v1.0";
const DEFAULT_SIZE = "1280x720"; // Official supported landscape size (no 1024x768).
const ALLOWED_SIZES = new Set(["1024x1024", "1280x720", "720x1280", "1280x1280"]);
const MAX_DOWNLOAD_BYTES = 12 * 1024 * 1024;
const PRIVATE_IP_PATTERNS = [
  /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./,
  /^::1$/, /^fc00:/i, /^fe80:/i, /^fd/i,
];

class HunyuanImageError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

function resolveModelName(configured) {
  const model = typeof configured === "string" ? configured.trim() : "";
  return model || DEFAULT_MODEL;
}

function resolveSize(configured) {
  const size = typeof configured === "string" ? configured.trim() : "";
  return ALLOWED_SIZES.has(size) ? size : DEFAULT_SIZE;
}

function isPrivateHost(hostname) {
  const host = String(hostname ?? "").toLowerCase();
  return host === "localhost" || PRIVATE_IP_PATTERNS.some((re) => re.test(host));
}

function detectImageMime(buffer, contentType) {
  if (buffer?.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer?.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return "image/png";
  if (buffer?.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }
  const type = String(contentType ?? "").split(";")[0].trim().toLowerCase();
  if (["image/jpeg", "image/png", "image/webp"].includes(type)) return type;
  return null;
}

function downloadHttpsBuffer(rawUrl, { maxBytes = MAX_DOWNLOAD_BYTES, timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(rawUrl); } catch {
      return reject(new HunyuanImageError("HY_IMAGE_URL_INVALID"));
    }
    if (parsed.protocol !== "https:") return reject(new HunyuanImageError("HY_IMAGE_URL_NOT_HTTPS"));
    if (isPrivateHost(parsed.hostname)) return reject(new HunyuanImageError("HY_IMAGE_HOST_PRIVATE"));

    const request = https.get(parsed, { timeout: timeoutMs }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        return resolve(downloadHttpsBuffer(response.headers.location, { maxBytes, timeoutMs }));
      }
      if (response.statusCode !== 200) {
        response.resume();
        return reject(new HunyuanImageError("HY_IMAGE_DOWNLOAD_FAILED", `HTTP ${response.statusCode}`));
      }
      const contentType = String(response.headers["content-type"] ?? "");
      const chunks = [];
      let size = 0;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          request.destroy();
          return reject(new HunyuanImageError("HY_IMAGE_TOO_LARGE"));
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({ buffer: Buffer.concat(chunks), contentType, size }));
      response.on("error", () => reject(new HunyuanImageError("HY_IMAGE_DOWNLOAD_FAILED")));
    });
    request.on("timeout", () => {
      request.destroy();
      reject(new HunyuanImageError("HY_IMAGE_DOWNLOAD_TIMEOUT"));
    });
    request.on("error", () => reject(new HunyuanImageError("HY_IMAGE_DOWNLOAD_FAILED")));
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createHunyuanImageService({
  ai,
  modelName,
  size,
  maxRetries = 3,
  generateImageImpl,
  downloadImpl = downloadHttpsBuffer,
} = {}) {
  const resolvedModel = resolveModelName(modelName);
  const resolvedSize = resolveSize(size);
  const retries = Math.min(Math.max(Number(maxRetries) || 3, 1), 5);

  async function callGenerate(prompt, { seed } = {}) {
    if (typeof generateImageImpl === "function") {
      return generateImageImpl({ model: resolvedModel, prompt, size: resolvedSize, seed });
    }
    if (!ai || typeof ai.createImageModel !== "function") {
      throw new HunyuanImageError("HY_IMAGE_SDK_UNAVAILABLE");
    }
    const imageModel = ai.createImageModel("hunyuan-image");
    const payload = {
      model: resolvedModel,
      prompt,
      size: resolvedSize,
      revise: { value: false },
    };
    if (Number.isInteger(seed) && seed > 0) payload.seed = seed;
    return imageModel.generateImage(payload);
  }

  return {
    modelName: resolvedModel,
    size: resolvedSize,
    buildFoodImagePrompt,
    maxPromptChars: MAX_PROMPT_CHARS,

    async generateOne(input) {
      const prompt = buildFoodImagePrompt(input);
      if (!prompt || prompt.length > MAX_PROMPT_CHARS) {
        throw new HunyuanImageError("HY_IMAGE_PROMPT_INVALID");
      }

      let lastError = null;
      for (let attempt = 1; attempt <= retries; attempt += 1) {
        try {
          const result = await callGenerate(prompt, { seed: input.seed });
          const item = Array.isArray(result?.data) ? result.data[0] : null;
          const temporaryUrl = typeof item?.url === "string" ? item.url.trim() : "";
          if (!temporaryUrl) throw new HunyuanImageError("HY_IMAGE_EMPTY_RESULT");
          return {
            temporaryUrl,
            prompt,
            revisedPrompt: typeof item?.revised_prompt === "string" ? item.revised_prompt : null,
            modelName: resolvedModel,
            size: resolvedSize,
          };
        } catch (error) {
          lastError = error instanceof HunyuanImageError
            ? error
            : new HunyuanImageError(
              "HY_IMAGE_GENERATE_FAILED",
              [
                error?.code,
                error?.error?.code,
                error?.message || (typeof error === "string" ? error : ""),
                error?.error?.message,
                error?.response?.status,
                error?.statusCode,
                error?.response?.data
                  ? JSON.stringify(error.response.data).slice(0, 400)
                  : "",
                !error?.message && error && typeof error === "object"
                  ? (() => {
                    try { return JSON.stringify(error, Object.getOwnPropertyNames(error)).slice(0, 400); }
                    catch { return ""; }
                  })()
                  : "",
              ].filter((part) => part !== undefined && part !== null && part !== "").join(" | ").slice(0, 800)
                || "empty SDK error",
            );
          console.error("[hunyuan] generateImage failed:", lastError.message);
          if (attempt < retries) await sleep(400 * attempt);
        }
      }
      throw lastError;
    },

    async downloadGeneratedImage(temporaryUrl) {
      if (!temporaryUrl) throw new HunyuanImageError("HY_IMAGE_URL_INVALID");
      const downloaded = await downloadImpl(temporaryUrl);
      const mimeType = detectImageMime(downloaded.buffer, downloaded.contentType);
      if (!mimeType) throw new HunyuanImageError("HY_IMAGE_MIME_INVALID");
      if (!downloaded.buffer?.length || downloaded.buffer.length < 1024) {
        throw new HunyuanImageError("HY_IMAGE_TOO_SMALL");
      }
      return {
        buffer: downloaded.buffer,
        mimeType,
        fileSize: downloaded.size,
        temporaryUrl,
      };
    },

    validateGeneratedResult(payload) {
      if (!payload?.temporaryUrl) throw new HunyuanImageError("HY_IMAGE_EMPTY_RESULT");
      if (!payload?.fileId && !payload?.storagePath) {
        throw new HunyuanImageError("HY_IMAGE_STORAGE_MISSING");
      }
      if (!payload?.detailUrl && !payload?.originalUrl) {
        throw new HunyuanImageError("HY_IMAGE_CDN_MISSING");
      }
      return true;
    },
  };
}

module.exports = {
  DEFAULT_MODEL,
  DEFAULT_SIZE,
  ALLOWED_SIZES,
  HunyuanImageError,
  createHunyuanImageService,
  resolveModelName,
  resolveSize,
  detectImageMime,
  downloadHttpsBuffer,
};
