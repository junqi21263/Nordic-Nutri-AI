const crypto = require("node:crypto");

const REAP_PATH = "/api/internal/vision-analysis/reap";

function makeSignature(secret, { timestamp, method = "POST", path, body }) {
  return crypto.createHmac("sha256", String(secret || ""))
    .update(`${timestamp}\n${method}\n${path}\n${body}`)
    .digest("hex");
}

async function reapOnce({
  endpoint = process.env.VISION_ANALYSIS_REAPER_API_BASE_URL,
  secret = process.env.VISION_ANALYSIS_REAPER_SECRET || process.env.AI_WORKER_SHARED_SECRET,
  limit = process.env.VISION_ANALYSIS_REAPER_LIMIT,
  now = () => Date.now(),
  request = globalThis.fetch,
} = {}) {
  if (!secret || typeof request !== "function") throw new Error("VISION_REAPER_CONFIG_MISSING");
  const body = JSON.stringify({ limit: Math.min(Math.max(Number(limit) || 100, 1), 500) });
  const timestamp = String(Math.floor(now() / 1000));
  const signature = makeSignature(secret, { timestamp, path: REAP_PATH, body });
  const response = await request(`${String(endpoint || "").replace(/\/+$/, "")}${REAP_PATH}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-vision-reaper-timestamp": timestamp,
      "x-vision-reaper-signature": signature,
    },
    body,
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`VISION_REAPER_HTTP_${response.status}`);
  return JSON.parse(raw || "{}");
}

exports.main = async () => reapOnce();
exports.REAP_PATH = REAP_PATH;
exports.makeSignature = makeSignature;
exports.reapOnce = reapOnce;
