const crypto = require("node:crypto");

const DISPATCH_PATH = "/api/internal/push-reminders/dispatch";

function makeSignature(secret, { timestamp, method = "POST", path, body }) {
  return crypto.createHmac("sha256", String(secret || ""))
    .update(`${timestamp}\n${method}\n${path}\n${body}`)
    .digest("hex");
}

async function dispatchOnce({
  endpoint = process.env.REMINDER_DISPATCH_API_BASE_URL,
  secret = process.env.REMINDER_DISPATCH_SECRET || process.env.AI_WORKER_SHARED_SECRET,
  limit = process.env.REMINDER_DISPATCH_LIMIT,
  now = () => Date.now(),
  request = globalThis.fetch,
} = {}) {
  if (!endpoint || !secret || typeof request !== "function") throw new Error("REMINDER_DISPATCH_CONFIG_MISSING");
  const body = JSON.stringify({ limit: Math.min(Math.max(Number(limit) || 100, 1), 500) });
  const timestamp = String(Math.floor(now() / 1000));
  const signature = makeSignature(secret, { timestamp, path: DISPATCH_PATH, body });
  const response = await request(`${String(endpoint).replace(/\/+$/, "")}${DISPATCH_PATH}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-reminder-dispatch-timestamp": timestamp, "x-reminder-dispatch-signature": signature },
    body,
  });
  const raw = await response.text();
  if (!response.ok) throw new Error(`REMINDER_DISPATCH_HTTP_${response.status}`);
  return JSON.parse(raw || "{}");
}

exports.main = async () => dispatchOnce();
exports.dispatchOnce = dispatchOnce;
exports.makeSignature = makeSignature;
