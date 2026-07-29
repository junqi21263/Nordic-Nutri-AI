// CloudBase timer entrypoint. It has no database credentials and can only call
// the main HTTP function through a timestamped HMAC request.

const crypto = require("node:crypto");

const DISPATCH_PATH = "/api/internal/food-image-batches/dispatch";

function clampMaxItems(value) {
  return Math.min(Math.max(Number(value) || 5, 1), 5);
}

function makeSignature(secret, { timestamp, method = "POST", path, body }) {
  const canonical = `${timestamp}\n${method}\n${path}\n${body}`;
  return crypto.createHmac("sha256", String(secret)).update(canonical).digest("hex");
}

function getDispatchUrl(endpoint) {
  const base = String(endpoint || "").trim().replace(/\/+$/, "");
  if (!/^https:\/\//i.test(base)) throw new Error("FOOD_IMAGE_DISPATCH_CONFIG_MISSING");
  return `${base}${DISPATCH_PATH}`;
}

async function dispatchOnce({
  endpoint = process.env.FOOD_IMAGE_DISPATCH_API_BASE_URL,
  secret = process.env.FOOD_IMAGE_DISPATCH_SECRET,
  maxItems = process.env.FOOD_IMAGE_DISPATCH_MAX_ITEMS,
  now = () => Date.now(),
  request = globalThis.fetch,
} = {}) {
  if (!secret || typeof request !== "function") throw new Error("FOOD_IMAGE_DISPATCH_CONFIG_MISSING");
  const url = getDispatchUrl(endpoint);
  const body = JSON.stringify({ maxItems: clampMaxItems(maxItems) });
  const timestamp = String(Math.floor(now() / 1000));
  const signature = makeSignature(secret, {
    timestamp,
    // CloudBase removes `/get-login-ticket` before the request reaches the
    // HTTP function. Sign the stable route, not the public gateway prefix.
    path: DISPATCH_PATH,
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
    const error = new Error(`FOOD_IMAGE_DISPATCH_HTTP_${response.status}`);
    error.code = "FOOD_IMAGE_DISPATCH_HTTP_FAILED";
    error.response = raw.slice(0, 800);
    throw error;
  }
  try {
    return JSON.parse(raw || "{}");
  } catch {
    throw new Error("FOOD_IMAGE_DISPATCH_RESPONSE_INVALID");
  }
}

module.exports = {
  main: async () => dispatchOnce(),
  DISPATCH_PATH,
  clampMaxItems,
  makeSignature,
  getDispatchUrl,
  dispatchOnce,
};
