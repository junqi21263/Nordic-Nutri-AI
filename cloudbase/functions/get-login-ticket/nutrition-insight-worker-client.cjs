const https = require("node:https");
const { createHmac } = require("node:crypto");

class NutritionInsightWorkerClientError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

const forbiddenPresentationWording = /```|[`*#]|^\s*(?:回复|答复|回答|建议|说明)\s*[:：]/m;

function requestJson({ url, headers, body, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const request = https.request(url, { method: "POST", headers, timeout: timeoutMs }, (response) => {
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

function validateInsight(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const headline = typeof value.headline === "string" ? value.headline.trim() : "";
  const content = typeof value.content === "string" ? value.content.trim() : "";
  if (!headline || headline.length > 28 || !content || content.length > 180 || forbiddenPresentationWording.test(`${headline}\n${content}`)) return null;
  if (value.source !== "hunyuan-exp" || typeof value.model !== "string" || !value.model.trim()) return null;
  return {
    headline,
    content,
    source: value.source,
    model: value.model.trim(),
    usage: value.usage && typeof value.usage === "object" ? value.usage : null,
  };
}

function validateWorkerMetadata(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.source !== "hunyuan-exp" || typeof value.model !== "string" || !value.model.trim()) return null;
  return {
    source: value.source,
    model: value.model.trim(),
    usage: value.usage && typeof value.usage === "object" ? value.usage : null,
  };
}

function validateDailyInsight(value) {
  const metadata = validateWorkerMetadata(value);
  const focus = typeof value?.focus === "string" ? value.focus.trim() : "";
  const headline = typeof value?.headline === "string" ? value.headline.trim() : "";
  const content = typeof value?.content === "string" ? value.content.trim() : "";
  return metadata && focus && headline && headline.length <= 32 && content && content.length <= 180 && !forbiddenPresentationWording.test(`${headline}\n${content}`)
    ? { focus, headline, content, ...metadata }
    : null;
}

function validateDailyTip(value) {
  const metadata = validateWorkerMetadata(value);
  const type = typeof value?.type === "string" ? value.type.trim() : "";
  const headline = typeof value?.headline === "string" ? value.headline.trim() : "";
  const content = typeof value?.content === "string" ? value.content.trim() : "";
  return metadata && ["nutrition_tip", "food_function", "food_knowledge"].includes(type) && headline && headline.length <= 32 && content && content.length <= 120 && !forbiddenPresentationWording.test(`${headline}\n${content}`)
    ? { type, headline, content, food: value.food ?? null, ...metadata }
    : null;
}

function validateCoachQuickPrompt(value) {
  const metadata = validateWorkerMetadata(value);
  const prompt = typeof value?.prompt === "string" ? value.prompt.trim() : "";
  return metadata && prompt && prompt.length <= 28 && /[？?]$/.test(prompt) && !forbiddenPresentationWording.test(prompt)
    ? { prompt: prompt.replace(/\?$/, "？"), ...metadata }
    : null;
}

function createNutritionInsightWorkerClient({ endpoint, sharedSecret, timeoutMs = 30000, now = () => Date.now(), requestImpl = requestJson } = {}) {
  let target;
  try { target = new URL(String(endpoint || "")); } catch {
    throw new NutritionInsightWorkerClientError("NUTRITION_INSIGHT_WORKER_CONFIG", "Worker HTTPS endpoint is required");
  }
  if (target.protocol !== "https:") {
    throw new NutritionInsightWorkerClientError("NUTRITION_INSIGHT_WORKER_CONFIG", "Worker HTTPS endpoint is required");
  }
  const secret = typeof sharedSecret === "string" ? sharedSecret.trim() : "";
  if (!secret) throw new NutritionInsightWorkerClientError("NUTRITION_INSIGHT_WORKER_CONFIG", "Worker shared secret is required");

  function endpointFor(route) {
    const targetUrl = new URL(target.toString());
    if (targetUrl.pathname.endsWith("/nutrition-insight")) {
      targetUrl.pathname = `${targetUrl.pathname.slice(0, -"/nutrition-insight".length)}/${route}`;
      return targetUrl.toString();
    }
    if (targetUrl.pathname.endsWith("/generate")) {
      if (route === "nutrition-insight") return targetUrl.toString();
      targetUrl.pathname = `${targetUrl.pathname.slice(0, -"/generate".length)}/${route}`;
      return targetUrl.toString();
    }
    throw new NutritionInsightWorkerClientError("NUTRITION_INSIGHT_WORKER_CONFIG", "Worker nutrition-insight endpoint is required");
  }

  async function requestWorker(route, payload, validate) {
    const body = JSON.stringify(payload);
    const timestamp = String(now());
    const signature = createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex");
    let response;
    try {
      response = await requestImpl({
        url: endpointFor(route),
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
      throw new NutritionInsightWorkerClientError("NUTRITION_INSIGHT_WORKER_UNAVAILABLE", error?.message || "Worker request failed");
    }
    let parsed = null;
    try { parsed = JSON.parse(response.body); } catch {}
    const result = response.statusCode >= 200 && response.statusCode < 300 ? validate(parsed) : null;
    if (!result) throw new NutritionInsightWorkerClientError("NUTRITION_INSIGHT_WORKER_FAILED", `Worker returned HTTP ${response.statusCode}`);
    return result;
  }

  return {
    async generateInsight(foodContext) {
      return requestWorker("nutrition-insight", { foodContext }, validateInsight);
    },
    async generateDailyInsight({ date, context }) {
      return requestWorker("daily-insight", { date, context }, validateDailyInsight);
    },
    async generateDailyTip({ type, context }) {
      return requestWorker("daily-tip", { type, context }, validateDailyTip);
    },
    async generateCoachQuickPrompt({ context }) {
      return requestWorker("coach-quick-prompt", { context }, validateCoachQuickPrompt);
    },
  };
}

module.exports = {
  NutritionInsightWorkerClientError,
  createNutritionInsightWorkerClient,
};
