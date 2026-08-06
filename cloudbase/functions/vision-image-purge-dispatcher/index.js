// CloudBase timer entrypoint for vision image TTL purge.
const crypto = require("node:crypto");

const PURGE_PATH = "/api/internal/vision-images/purge";

function clampLimit(value) {
  return Math.min(Math.max(Number(value) || 200, 1), 500);
}

function makeSignature(secret, { timestamp, method = "POST", path, body }) {
  const canonical = `${timestamp}\n${method}\n${path}\n${body}`;
  return crypto.createHmac("sha256", String(secret)).update(canonical).digest("hex");
}

function getPurgeUrl(endpoint) {
  const base = String(endpoint || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(base)) throw new Error("VISION_PURGE_CONFIG_MISSING");
  return `${base}${PURGE_PATH}`;
}

async function purgeOnce({
  endpoint = process.env.FOOD_IMAGE_DISPATCH_API_BASE_URL || process.env.VISION_PURGE_API_BASE_URL,
  secret = process.env.FOOD_IMAGE_DISPATCH_SECRET || process.env.AI_WORKER_SHARED_SECRET,
  limit = process.env.VISION_PURGE_LIMIT,
  now = () => Date.now(),
  request = globalThis.fetch,
} = {}) {
  if (!secret || typeof request !== "function") throw new Error("VISION_PURGE_CONFIG_MISSING");
  const url = getPurgeUrl(endpoint);
  const body = JSON.stringify({ limit: clampLimit(limit), purgeDeletionAudit: true });
  const timestamp = String(Math.floor(now() / 1000));
  const signature = makeSignature(secret, {
    timestamp,
    path: PURGE_PATH,
    body,
  });
  const response = await request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-food-image-dispatch-timestamp": timestamp,
      "x-food-image-dispatch-signature": signature,
    },
    body,
  });
  const raw = await response.text();
  if (!response.ok) {
    const error = new Error(`VISION_PURGE_HTTP_${response.status}`);
    error.code = "VISION_PURGE_HTTP_FAILED";
    error.response = raw.slice(0, 800);
    throw error;
  }
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw new Error("VISION_PURGE_RESPONSE_INVALID");
  }
}

module.exports = {
  main: async () => purgeOnce(),
  PURGE_PATH,
  clampLimit,
  makeSignature,
  getPurgeUrl,
  purgeOnce,
};
