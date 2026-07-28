const https = require("node:https");
const { createHmac } = require("node:crypto");

class HunyuanWorkerClientError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

function requestJson({ url, headers, body, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, {
      method: "POST",
      headers,
      timeout: timeoutMs,
    }, (response) => {
      let raw = "";
      response.setEncoding("utf8");
      response.on("data", (chunk) => { raw += chunk; });
      response.on("end", () => resolve({ statusCode: response.statusCode || 0, body: raw }));
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error("Worker request timed out")));
    request.on("error", reject);
    request.end(body);
  });
}

function createHunyuanWorkerClient({ endpoint, sharedSecret, timeoutMs = 120000, now = () => Date.now(), requestImpl = requestJson } = {}) {
  let target;
  try { target = new URL(String(endpoint || "")); } catch {
    throw new HunyuanWorkerClientError("HY_IMAGE_WORKER_CONFIG", "Worker HTTPS endpoint is required");
  }
  if (target.protocol !== "https:") {
    throw new HunyuanWorkerClientError("HY_IMAGE_WORKER_CONFIG", "Worker HTTPS endpoint is required");
  }
  const secret = typeof sharedSecret === "string" ? sharedSecret.trim() : "";
  if (!secret) throw new HunyuanWorkerClientError("HY_IMAGE_WORKER_CONFIG", "Worker shared secret is required");

  return {
    async generateImage({ model, prompt, size, seed } = {}) {
      const payload = { model, prompt, size };
      if (Number.isInteger(seed) && seed > 0) payload.seed = seed;
      const body = JSON.stringify(payload);
      const timestamp = String(now());
      const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
      let response;
      try {
        response = await requestImpl({
          url: target.toString(),
          timeoutMs,
          body,
          headers: {
            "content-type": "application/json",
            "content-length": String(Buffer.byteLength(body)),
            "x-nordic-worker-timestamp": timestamp,
            "x-nordic-worker-signature": signature,
          },
        });
      } catch (error) {
        throw new HunyuanWorkerClientError("HY_IMAGE_WORKER_UNAVAILABLE", error?.message || "Worker request failed");
      }
      let parsed = null;
      try { parsed = JSON.parse(response.body); } catch {}
      if (response.statusCode < 200 || response.statusCode >= 300 || !Array.isArray(parsed?.data)) {
        throw new HunyuanWorkerClientError("HY_IMAGE_WORKER_FAILED", `Worker returned HTTP ${response.statusCode}`);
      }
      return parsed;
    },
  };
}

module.exports = {
  HunyuanWorkerClientError,
  createHunyuanWorkerClient,
};
