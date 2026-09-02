import assert from "node:assert/strict";
import test from "node:test";
import {
  ModelAdapterError,
  createRoutedOpenAiFetch,
  createTextModelAdapter,
} from "./text-model-adapter-registry.cjs";

test("sends a configured OpenAI-compatible model to its configured endpoint", async () => {
  let request = null;
  const adapter = createTextModelAdapter({
    providerKey: "qwen",
    modelKey: "qwen3-vl-flash",
    baseUrl: "https://models.example.test/v1",
    endpoint: "/chat/completions",
    credential: "server-only-key",
    timeoutMs: 1200,
    maxTokens: 321,
    temperature: 0.4,
  }, {
    fetchImpl: async (url, init) => {
      request = { url, init };
      return { ok: true, json: async () => ({ choices: [{ message: { content: '{"ok":true}' } }], usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 } }) };
    },
  });

  const result = await adapter.complete({ messages: [{ role: "user", content: "{}" }], responseFormat: "json_object" });
  assert.equal(request.url, "https://models.example.test/v1/chat/completions");
  assert.equal(request.init.headers.authorization, "Bearer server-only-key");
  assert.equal(JSON.parse(request.init.body).model, "qwen3-vl-flash");
  assert.equal(JSON.parse(request.init.body).max_tokens, 321);
  assert.equal(result.content, '{"ok":true}');
  assert.deepEqual(result.usage, { promptTokens: 3, completionTokens: 2, totalTokens: 5 });
  assert.equal(result.provider, "qwen");
});

test("fails closed for a configured text route without a credential or transport", () => {
  assert.throws(
    () => createTextModelAdapter({ providerKey: "qwen", modelKey: "qwen3-vl-flash" }),
    (error) => error instanceof ModelAdapterError && error.code === "MODEL_CREDENTIAL_MISSING",
  );
});

test("rewrites legacy OpenAI-compatible requests to the selected runtime route", async () => {
  let request = null;
  const routedFetch = createRoutedOpenAiFetch({
    providerKey: "qwen",
    modelKey: "qwen3-vl-flash",
    baseUrl: "https://models.example.test/v1",
    endpoint: "/chat/completions",
    credential: "server-only-key",
  }, {
    fetchImpl: async (url, init) => {
      request = { url, init };
      return { ok: true, json: async () => ({}) };
    },
  });

  await routedFetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { authorization: "Bearer legacy", "content-type": "application/json" },
    body: JSON.stringify({ model: "deepseek-v4-flash", thinking: { type: "disabled" }, messages: [] }),
  });

  assert.equal(request.url, "https://models.example.test/v1/chat/completions");
  assert.equal(request.init.headers.authorization, "Bearer server-only-key");
  assert.equal(JSON.parse(request.init.body).model, "qwen3-vl-flash");
  assert.equal("thinking" in JSON.parse(request.init.body), false);
});

test("keeps SenseNova 6.8 OpenAI-compatible requests intact and preserves response semantics", async () => {
  let request = null;
  const upstream = {
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers({ "content-type": "text/event-stream" }),
    body: { [Symbol.asyncIterator]: async function* () { yield new TextEncoder().encode("data: [DONE]\\n\\n"); } },
    json: async () => ({ choices: [{ message: { content: "ok" } }] }),
  };
  const routedFetch = createRoutedOpenAiFetch({
    providerKey: "sensenova",
    modelKey: "sensenova-6.8-flash-lite",
    baseUrl: "https://token.sensenova.cn/v1",
    endpoint: "/chat/completions",
    protocol: "openai-chat-completions",
    credential: "server-only-key",
  }, { fetchImpl: async (url, init) => {
    request = { url, init };
    return upstream;
  } });

  const response = await routedFetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    body: JSON.stringify({ model: "legacy", max_tokens: 600, stream: true, messages: [] }),
  });

  const body = JSON.parse(request.init.body);
  assert.equal(request.url, "https://token.sensenova.cn/v1/chat/completions");
  assert.equal(body.max_tokens, 600);
  assert.equal(body.max_new_tokens, undefined);
  assert.equal(response.ok, true);
  assert.equal(response.status, 200);
  assert.equal(response.body, upstream.body);
});

test("uses an explicit absolute endpoint without requiring a base URL", async () => {
  let requestUrl = null;
  const routedFetch = createRoutedOpenAiFetch({
    providerKey: "qwen",
    modelKey: "qwen3-vl-flash",
    endpoint: "https://models.example.test/v1/chat/completions",
    protocol: "openai-chat-completions",
    credential: "server-only-key",
  }, { fetchImpl: async (url) => {
    requestUrl = url;
    return { ok: true, json: async () => ({}) };
  } });

  await routedFetch("ignored", { body: JSON.stringify({ messages: [] }) });
  assert.equal(requestUrl, "https://models.example.test/v1/chat/completions");
});

test("normalizes SenseNova native chat requests only when its native protocol is selected", async () => {
  let request = null;
  const routedFetch = createRoutedOpenAiFetch({
    providerKey: "sensenova",
    modelKey: "sensenova-6.8-flash-lite",
    endpoint: "/v1/llm/chat-completions",
    baseUrl: "https://api.sensenova.cn",
    protocol: "sensenova-native-chat-completions",
    credential: "server-only-key",
  }, { fetchImpl: async (url, init) => {
    request = { url, init };
    return { ok: true, json: async () => ({}) };
  } });

  await routedFetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    body: JSON.stringify({ model: "legacy", thinking: { type: "disabled" }, response_format: { type: "json_object" }, max_tokens: 600, stream_options: { include_usage: true }, stream: true, messages: [] }),
  });

  const body = JSON.parse(request.init.body);
  assert.equal(request.url, "https://api.sensenova.cn/v1/llm/chat-completions");
  assert.equal(body.model, "sensenova-6.8-flash-lite");
  assert.equal(body.max_new_tokens, 600);
  assert.equal(body.max_tokens, undefined);
  assert.equal(body.response_format, undefined);
  assert.equal(body.stream_options, undefined);
  assert.equal(body.thinking, undefined);
});

test("normalizes nested SenseNova responses only for its native protocol", async () => {
  const routedFetch = createRoutedOpenAiFetch({
    providerKey: "sensenova", modelKey: "sensenova-6.8-flash-lite",
    baseUrl: "https://api.sensenova.cn", endpoint: "/v1/llm/chat-completions", protocol: "sensenova-native-chat-completions", credential: "key",
  }, { fetchImpl: async () => ({
    ok: true,
    json: async () => ({ data: { model: "sensenova-6.8-flash-lite", choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 1 } } }),
  }) });
  const response = await routedFetch("ignored", { body: JSON.stringify({ messages: [] }) });
  assert.equal((await response.json()).choices[0].message.content, "ok");
  assert.equal((await response.json()).model, "sensenova-6.8-flash-lite");
});
