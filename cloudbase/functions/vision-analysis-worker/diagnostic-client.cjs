const crypto = require("node:crypto");

const DIAGNOSTIC_PATH = "/api/internal/vision-analysis/diagnostic";

function createDiagnosticRecorder({ env = process.env, request = globalThis.fetch, now = () => Date.now(), timeoutMs = 500 } = {}) {
  return async (event = {}) => {
    const base = String(env.VISION_ANALYSIS_DISPATCH_API_BASE_URL || "").trim().replace(/\/+$/, "");
    const secret = env.VISION_ANALYSIS_DISPATCH_SECRET || env.AI_WORKER_SHARED_SECRET;
    if (!/^https:\/\//i.test(base) || !secret || typeof request !== "function") return false;
    const body = JSON.stringify(event);
    const timestamp = String(Math.floor(now() / 1000));
    const signature = crypto.createHmac("sha256", String(secret)).update(`${timestamp}\nPOST\n${DIAGNOSTIC_PATH}\n${body}`).digest("hex");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await request(`${base}${DIAGNOSTIC_PATH}`, { method: "POST", headers: { "content-type": "application/json", "x-vision-dispatch-timestamp": timestamp, "x-vision-dispatch-signature": signature }, body, signal: controller.signal });
      return response.ok;
    } catch { return false; } finally { clearTimeout(timer); }
  };
}

module.exports = { DIAGNOSTIC_PATH, createDiagnosticRecorder };
