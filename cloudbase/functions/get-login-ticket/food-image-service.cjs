// food-image-service.cjs
// Food image acquisition: SSRF-safe download from allow-listed hosts, SHA-256
// content-hash dedup, square crop + thumb/medium/detail WebP generation (via
// sharp when available; graceful fallback to the original bytes), and upload to
// CloudBase Storage. Storage paths are the only canonical image address;
// display URLs are derived from the active CDN at read time.

const https = require("node:https");
const crypto = require("node:crypto");

const DEFAULT_ALLOWED_HOSTS = [
  "images.openfoodfacts.org",
  "world.openfoodfacts.org",
  "static.openfoodfacts.org",
  "images-us.openfoodfacts.org",
];
const DEFAULT_MAX_BYTES = 10 * 1024 * 1024; // 10MB
const MAX_REDIRECTS = 3;
const PRIVATE_IP_PATTERNS = [
  /^127\./, /^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^169\.254\./,
  /^::1$/, /^fc00:/i, /^fe80:/i, /^fd/i, /^0\./,
];

class FoodImageError extends Error {
  constructor(code) { super(code); this.code = code; }
}

function isAllowedHost(hostname, allowedHosts) {
  const host = String(hostname ?? "").toLowerCase();
  return allowedHosts.some((allowed) => host === allowed || host.endsWith(`.${allowed}`));
}

function isPrivateIp(hostname) {
  const host = String(hostname ?? "").toLowerCase();
  return PRIVATE_IP_PATTERNS.some((re) => re.test(host)) || host === "localhost";
}

function validateImageUrl(rawUrl, allowedHosts) {
  let url;
  try { url = new URL(rawUrl); } catch { throw new FoodImageError("FOOD_IMAGE_URL_INVALID"); }
  if (url.protocol !== "https:") throw new FoodImageError("FOOD_IMAGE_URL_NOT_HTTPS");
  if (isPrivateIp(url.hostname)) throw new FoodImageError("FOOD_IMAGE_HOST_PRIVATE");
  if (!isAllowedHost(url.hostname, allowedHosts)) throw new FoodImageError("FOOD_IMAGE_HOST_NOT_ALLOWED");
  return url;
}

function downloadWithRedirects(url, { maxRedirects = MAX_REDIRECTS, maxBytes, allowedHosts, timeoutMs = 8000 } = {}, depth = 0) {
  return new Promise((resolve, reject) => {
    if (depth > maxRedirects) return reject(new FoodImageError("FOOD_IMAGE_TOO_MANY_REDIRECTS"));
    let parsed;
    try { parsed = new URL(url); } catch { return reject(new FoodImageError("FOOD_IMAGE_URL_INVALID")); }
    if (parsed.protocol !== "https:") return reject(new FoodImageError("FOOD_IMAGE_URL_NOT_HTTPS"));
    if (!isAllowedHost(parsed.hostname, allowedHosts)) return reject(new FoodImageError("FOOD_IMAGE_HOST_NOT_ALLOWED"));
    if (isPrivateIp(parsed.hostname)) return reject(new FoodImageError("FOOD_IMAGE_HOST_PRIVATE"));
    const request = https.get(parsed, { timeout: timeoutMs }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        response.resume();
        const next = new URL(response.headers.location, parsed).toString();
        return resolve(downloadWithRedirects(next, { maxRedirects, maxBytes, allowedHosts, timeoutMs }, depth + 1));
      }
      if (response.statusCode !== 200) {
        response.resume();
        return reject(new FoodImageError(`FOOD_IMAGE_DOWNLOAD_${response.statusCode}`));
      }
      const contentType = String(response.headers["content-type"] ?? "").split(";")[0].trim();
      const chunks = [];
      let size = 0;
      let aborted = false;
      response.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          aborted = true;
          request.destroy(new FoodImageError("FOOD_IMAGE_TOO_LARGE"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        if (aborted) return;
        const buffer = Buffer.concat(chunks);
        resolve({ buffer, contentType, size });
      });
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new FoodImageError("FOOD_IMAGE_DOWNLOAD_TIMEOUT")));
    request.on("error", (err) => reject(err instanceof FoodImageError ? err : new FoodImageError("FOOD_IMAGE_DOWNLOAD_FAILED")));
  });
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function loadSharp() {
  try { return require("sharp"); } catch { return null; }
}

async function transformImage(buffer, sharp) {
  if (!sharp) {
    // Fallback: no transform; store the original bytes for every display
    // variant so derived CDN paths remain valid even without sharp.
    return {
      detail: buffer,
      medium: buffer,
      thumb: buffer,
      original: buffer,
      mime: "image/webp",
      transformed: false,
      width: null,
      height: null,
    };
  }
  const metadata = await sharp(buffer).metadata();
  const square = sharp(buffer).resize({ width: 800, height: 800, fit: "cover", position: "centre" });
  const detail = await square.clone().webp({ quality: 82 }).toBuffer();
  const medium = await sharp(buffer).resize({ width: 400, height: 400, fit: "cover", position: "centre" }).webp({ quality: 78 }).toBuffer();
  const thumb = await sharp(buffer).resize({ width: 160, height: 160, fit: "cover", position: "centre" }).webp({ quality: 72 }).toBuffer();
  return {
    detail, medium, thumb,
    original: buffer,
    mime: "image/webp",
    transformed: true,
    width: metadata?.width ?? null,
    height: metadata?.height ?? null,
  };
}

/** 4:3 food-card variants for Hunyuan library images (detail 1024x768). */
async function transformFoodCardImage(buffer, sharp) {
  if (!sharp) {
    return {
      original: buffer,
      detail: buffer,
      list: buffer,
      thumb: buffer,
      mime: "image/jpeg",
      transformed: false,
      width: null,
      height: null,
    };
  }
  const metadata = await sharp(buffer).metadata();
  const detail = await sharp(buffer).resize({ width: 1024, height: 768, fit: "cover", position: "centre" }).webp({ quality: 84 }).toBuffer();
  const list = await sharp(buffer).resize({ width: 320, height: 240, fit: "cover", position: "centre" }).webp({ quality: 78 }).toBuffer();
  const thumb = await sharp(buffer).resize({ width: 160, height: 120, fit: "cover", position: "centre" }).webp({ quality: 72 }).toBuffer();
  return {
    original: buffer,
    detail,
    list,
    thumb,
    mime: "image/webp",
    transformed: true,
    width: 1024,
    height: 768,
    sourceWidth: metadata?.width ?? null,
    sourceHeight: metadata?.height ?? null,
  };
}

function createFoodImageService({
  allowedHosts = DEFAULT_ALLOWED_HOSTS,
  maxBytes = DEFAULT_MAX_BYTES,
  storageBucket = "food-images",
  storagePrefix = "food-library",
  downloader = downloadWithRedirects,
  sharpLoader = loadSharp,
  uploader,
} = {}) {
  return {
    validateImageUrl: (url) => validateImageUrl(url, allowedHosts),

    /**
     * Persist a Hunyuan (or other) generated buffer into food-library/...
     * Returns permanent Storage paths/fileIDs — never temporary or persisted URLs.
     */
    async persistGeneratedImage({
      buffer,
      mimeType = "image/jpeg",
      foodId,
      imageId,
      storagePrefix: prefixOverride,
    }) {
      if (!Buffer.isBuffer(buffer) || !buffer.length) throw new FoodImageError("FOOD_IMAGE_UPLOAD_EMPTY");
      if (buffer.length > maxBytes) throw new FoodImageError("FOOD_IMAGE_TOO_LARGE");
      if (!foodId || !imageId) throw new FoodImageError("FOOD_IMAGE_PATH_INVALID");
      const sharp = sharpLoader();
      const transformed = await transformFoodCardImage(buffer, sharp);
      const prefix = String(prefixOverride || storagePrefix || "food-library").replace(/^\/+|\/+$/g, "");
      const basePath = `${prefix}/${foodId}/${imageId}`;
      const ext = mimeType === "image/png" ? "png" : mimeType === "image/webp" ? "webp" : "jpg";
      const variants = [
        { name: "original", buffer: transformed.original, path: `${basePath}/original.${ext}`, contentType: mimeType },
        { name: "detail", buffer: transformed.detail, path: `${basePath}/detail.webp`, contentType: "image/webp" },
        { name: "list", buffer: transformed.list, path: `${basePath}/list.webp`, contentType: "image/webp" },
        { name: "thumb", buffer: transformed.thumb, path: `${basePath}/thumbnail.webp`, contentType: "image/webp" },
      ].filter((v) => v.buffer);
      const uploaded = {};
      const fileIds = {};
      if (typeof uploader !== "function") throw new FoodImageError("FOOD_IMAGE_UPLOADER_MISSING");
      for (const v of variants) {
        try {
          const result = await uploader({ cloudPath: v.path, fileContent: v.buffer, contentType: v.contentType });
          // Ignore uploader URLs deliberately. They may be temporary; the
          // repository derives stable URLs from storage_path at read time.
          uploaded[v.name] = null;
          fileIds[v.name] = result?.fileID ?? result?.fileId ?? null;
        } catch {
          uploaded[v.name] = null;
          fileIds[v.name] = null;
        }
      }
      if (variants.some((variant) => !fileIds[variant.name])) {
        throw new FoodImageError("FOOD_IMAGE_UPLOAD_FAILED");
      }
      return {
        contentHash: sha256(buffer),
        mimeType: transformed.mime,
        width: transformed.width,
        height: transformed.height,
        fileSize: buffer.length,
        storagePath: basePath,
        originalFileId: fileIds.original || fileIds.detail || null,
        originalUrl: null,
        thumbUrl: null,
        mediumUrl: null,
        detailUrl: null,
        transformed: transformed.transformed,
      };
    },

    async acquireFromUrl(rawUrl, { imageEntityKey } = {}) {
      const url = validateImageUrl(rawUrl, allowedHosts);
      const { buffer, contentType, size } = await downloader(url.toString(), { maxBytes, allowedHosts });
      const hash = sha256(buffer);
      const sharp = sharpLoader();
      const transformed = await transformImage(buffer, sharp);
      const entityKey = imageEntityKey || hash.slice(0, 16);
      const variants = [
        { name: "thumb", buffer: transformed.thumb, suffix: "thumb" },
        { name: "medium", buffer: transformed.medium, suffix: "medium" },
        { name: "detail", buffer: transformed.detail, suffix: "detail" },
      ].filter((v) => v.buffer);
      const uploaded = {};
      if (typeof uploader === "function") {
        for (const v of variants) {
          const cloudPath = `foods/${entityKey}/${hash}/${v.suffix}.webp`;
          try {
            const result = await uploader({ cloudPath, fileContent: v.buffer, contentType: "image/webp" });
            uploaded[v.name] = result?.fileID ?? result?.fileId ?? null;
          } catch (err) {
            // A failed variant should not abort the others.
            uploaded[v.name] = null;
          }
        }
      }
      if (variants.some((variant) => !uploaded[variant.name])) {
        throw new FoodImageError("FOOD_IMAGE_UPLOAD_FAILED");
      }
      return {
        contentHash: hash,
        mimeType: transformed.mime,
        width: transformed.width,
        height: transformed.height,
        fileSize: size,
        thumbUrl: null,
        mediumUrl: null,
        detailUrl: null,
        storagePath: variants.length ? `foods/${entityKey}/${hash}` : null,
        transformed: transformed.transformed,
        sourceUrl: url.toString(),
      };
    },

    async acquireFromUpload({ buffer, contentType, imageEntityKey, uploadedBy }) {
      if (!Buffer.isBuffer(buffer) || !buffer.length) throw new FoodImageError("FOOD_IMAGE_UPLOAD_EMPTY");
      if (buffer.length > maxBytes) throw new FoodImageError("FOOD_IMAGE_TOO_LARGE");
      const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
      if (!allowedTypes.includes(String(contentType ?? "").split(";")[0].trim())) {
        throw new FoodImageError("FOOD_IMAGE_TYPE_NOT_ALLOWED");
      }
      const hash = sha256(buffer);
      const sharp = sharpLoader();
      const transformed = await transformImage(buffer, sharp);
      const entityKey = imageEntityKey || hash.slice(0, 16);
      const variants = [
        { name: "thumb", buffer: transformed.thumb, suffix: "thumb" },
        { name: "medium", buffer: transformed.medium, suffix: "medium" },
        { name: "detail", buffer: transformed.detail, suffix: "detail" },
      ].filter((v) => v.buffer);
      const uploaded = {};
      if (typeof uploader === "function") {
        for (const v of variants) {
          const cloudPath = `foods/${entityKey}/${hash}/${v.suffix}.webp`;
          try { const r = await uploader({ cloudPath, fileContent: v.buffer, contentType: "image/webp" }); uploaded[v.name] = r?.fileID ?? r?.fileId ?? null; }
          catch { uploaded[v.name] = null; }
        }
      }
      if (variants.some((variant) => !uploaded[variant.name])) {
        throw new FoodImageError("FOOD_IMAGE_UPLOAD_FAILED");
      }
      return {
        contentHash: hash,
        mimeType: transformed.mime,
        width: transformed.width,
        height: transformed.height,
        fileSize: buffer.length,
        thumbUrl: null,
        mediumUrl: null,
        detailUrl: null,
        storagePath: variants.length ? `foods/${entityKey}/${hash}` : null,
        transformed: transformed.transformed,
        uploadedBy: uploadedBy ?? null,
        status: "pending",
      };
    },
  };
}

module.exports = {
  DEFAULT_ALLOWED_HOSTS,
  DEFAULT_MAX_BYTES,
  FoodImageError,
  createFoodImageService,
  validateImageUrl,
  isAllowedHost,
  isPrivateIp,
  sha256,
  transformImage,
  transformFoodCardImage,
};
