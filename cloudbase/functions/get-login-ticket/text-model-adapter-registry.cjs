const { extractContentAndUsage } = require("./model-usage.cjs");

const DEFAULT_CHAT_ENDPOINTS = Object.freeze({
  deepseek: "https://api.deepseek.com/chat/completions",
  qwen: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
  openai: "https://api.openai.com/v1/chat/completions",
  moonshot: "https://api.moonshot.cn/v1/chat/completions",
  zhipu: "https://open.bigmodel.cn/api/paas/v4/chat/completions",
  minimax: "https://api.minimaxi.chat/v1/chat/completions",
  siliconflow: "https://api.siliconflow.cn/v1/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  sensenova: "https://token.sensenova.cn/v1/chat/completions",
});

const SENSENOVA_NATIVE_CHAT_PROTOCOL = "sensenova-native-chat-completions";

function isSenseNovaNativeRoute(route = {}) {
  return String(route.providerKey || "").trim() === "sensenova"
    && String(route.protocol || "").trim() === SENSENOVA_NATIVE_CHAT_PROTOCOL;
}

function normalizeProviderPayload(route, payload) {
  if (!isSenseNovaNativeRoute(route) || !payload?.data || typeof payload.data !== "object") return payload;
  const nested = payload.data;
  if (!nested.choices && !nested.usage) return payload;
  return { ...nested, model: nested.model || payload.model };
}

function normalizeProviderStreamBody(route, body) {
  if (!isSenseNovaNativeRoute(route) || !body || typeof body[Symbol.asyncIterator] !== "function") return body;
  return (async function* normalizeStream() {
    const decoder = new TextDecoder();
    let buffer = "";
    const emit = (frame) => {
      const dataLine = frame.split("\n").find((line) => line.trimStart().startsWith("data:"));
      const raw = dataLine?.trimStart().slice(5).trim();
      if (!raw) return "";
      if (raw === "[DONE]") return "data: [DONE]\n\n";
      try {
        const payload = normalizeProviderPayload(route, JSON.parse(raw));
        return `data: ${JSON.stringify(payload)}\n\n`;
      } catch {
        return "";
      }
    };
    for await (const chunk of body) {
      buffer += decoder.decode(chunk, { stream: true });
      let separatorMatch = buffer.match(/\r?\n\r?\n/);
      while (separatorMatch) {
        const separator = separatorMatch.index;
        const separatorLength = separatorMatch[0].length;
        const frame = buffer.slice(0, separator);
        buffer = buffer.slice(separator + separatorLength);
        const normalized = emit(frame);
        if (normalized) yield new TextEncoder().encode(normalized);
        separatorMatch = buffer.match(/\r?\n\r?\n/);
      }
    }
  })();
}

class ModelAdapterError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "ModelAdapterError";
    this.code = code;
  }
}

function resolveChatEndpoint(route = {}) {
  const baseUrl = String(route.baseUrl || "").trim().replace(/\/$/, "");
  const endpoint = String(route.endpoint || "").trim();
  if (/^https:\/\//i.test(endpoint)) return endpoint;
  if (baseUrl && endpoint) return `${baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
  if (baseUrl) return /\/chat\/completions$/i.test(baseUrl) ? baseUrl : `${baseUrl}/chat/completions`;
  const fallback = DEFAULT_CHAT_ENDPOINTS[String(route.providerKey || "").trim()];
  if (!fallback) throw new ModelAdapterError("MODEL_ENDPOINT_MISSING");
  return fallback;
}

function normalizedInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function createTextModelAdapter(route = {}, { fetchImpl = globalThis.fetch } = {}) {
  const provider = String(route.providerKey || "").trim();
  const model = String(route.modelKey || "").trim();
  const credential = String(route.credential || "").trim();
  if (!provider || !model) throw new ModelAdapterError("MODEL_ROUTE_INVALID");
  if (!credential) throw new ModelAdapterError("MODEL_CREDENTIAL_MISSING");
  if (typeof fetchImpl !== "function") throw new ModelAdapterError("MODEL_TRANSPORT_UNAVAILABLE");
  const url = resolveChatEndpoint(route);
  const timeoutMs = normalizedInteger(route.timeoutMs, 30000);
  const maxTokens = normalizedInteger(route.maxTokens, 512);
  const temperature = Number.isFinite(Number(route.temperature)) ? Number(route.temperature) : 0.2;

  async function complete({ messages, maxTokens: requestedMaxTokens, temperature: requestedTemperature, responseFormat = null } = {}) {
    if (!Array.isArray(messages) || !messages.length) throw new ModelAdapterError("MODEL_REQUEST_INVALID");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const body = {
        model,
        messages,
        max_tokens: normalizedInteger(requestedMaxTokens, maxTokens),
        temperature: Number.isFinite(Number(requestedTemperature)) ? Number(requestedTemperature) : temperature,
      };
      if (responseFormat === "json_object") body.response_format = { type: "json_object" };
      const response = await fetchImpl(url, {
        method: "POST",
        headers: { authorization: `Bearer ${credential}`, "content-type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!response?.ok) throw new ModelAdapterError("MODEL_UPSTREAM_REJECTED");
      const payload = normalizeProviderPayload(route, await response.json());
      const parsed = extractContentAndUsage(payload);
      if (typeof parsed.content !== "string" || !parsed.content.trim()) throw new ModelAdapterError("MODEL_RESPONSE_INVALID");
      return {
        content: parsed.content,
        usage: parsed.usage,
        provider,
        model: parsed.model || model,
      };
    } catch (error) {
      if (error instanceof ModelAdapterError) throw error;
      if (error?.name === "AbortError") throw new ModelAdapterError("MODEL_TIMEOUT");
      throw new ModelAdapterError("MODEL_REQUEST_FAILED");
    } finally {
      clearTimeout(timer);
    }
  }

  return { provider, model, complete };
}

function createRoutedOpenAiFetch(route = {}, { fetchImpl = globalThis.fetch } = {}) {
  const provider = String(route.providerKey || "").trim();
  const model = String(route.modelKey || "").trim();
  const credential = String(route.credential || "").trim();
  if (!provider || !model) throw new ModelAdapterError("MODEL_ROUTE_INVALID");
  if (!credential) throw new ModelAdapterError("MODEL_CREDENTIAL_MISSING");
  if (typeof fetchImpl !== "function") throw new ModelAdapterError("MODEL_TRANSPORT_UNAVAILABLE");
  const url = resolveChatEndpoint(route);
  return async (_ignoredUrl, init = {}) => {
    let payload;
    try {
      payload = typeof init.body === "string" ? JSON.parse(init.body) : init.body;
    } catch {
      throw new ModelAdapterError("MODEL_REQUEST_INVALID");
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new ModelAdapterError("MODEL_REQUEST_INVALID");
    const { thinking: _legacyThinking, stream_options: _streamOptions, response_format: _responseFormat, ...body } = payload;
    if (isSenseNovaNativeRoute(route) && body.max_tokens !== undefined) {
      body.max_new_tokens = body.max_tokens;
      delete body.max_tokens;
    }
    const headers = { ...(init.headers || {}), authorization: `Bearer ${credential}`, "content-type": "application/json" };
    const response = await fetchImpl(url, { ...init, headers, body: JSON.stringify({ ...body, model }) });
    if (!isSenseNovaNativeRoute(route)) return response;
    return {
      ok: response?.ok,
      status: response?.status,
      statusText: response?.statusText,
      headers: response?.headers,
      url: response?.url,
      redirected: response?.redirected,
      type: response?.type,
      json: async () => normalizeProviderPayload(route, await response.json()),
      body: normalizeProviderStreamBody(route, response?.body),
    };
  };
}

module.exports = {
  DEFAULT_CHAT_ENDPOINTS,
  SENSENOVA_NATIVE_CHAT_PROTOCOL,
  ModelAdapterError,
  resolveChatEndpoint,
  createTextModelAdapter,
  createRoutedOpenAiFetch,
};
