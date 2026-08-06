import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  extractOpenAiUsage,
  extractContentAndUsage,
  extractUsageFromAny,
  recordModelUsage,
} = require("./model-usage.cjs");

test("extractOpenAiUsage maps prompt/completion/total tokens", () => {
  assert.deepEqual(extractOpenAiUsage({
    usage: { prompt_tokens: 12, completion_tokens: 8, total_tokens: 20 },
  }), { promptTokens: 12, completionTokens: 8, totalTokens: 20 });
  assert.deepEqual(extractOpenAiUsage({
    usage: { input_tokens: 3, output_tokens: 4 },
  }), { promptTokens: 3, completionTokens: 4, totalTokens: 7 });
  assert.equal(extractOpenAiUsage({}), null);
});

test("extractContentAndUsage returns content and usage", () => {
  const parsed = extractContentAndUsage({
    model: "deepseek-v4-flash",
    choices: [{ message: { content: "{\"ok\":true}" } }],
    usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3 },
  });
  assert.equal(parsed.content, "{\"ok\":true}");
  assert.deepEqual(parsed.usage, { promptTokens: 1, completionTokens: 2, totalTokens: 3 });
  assert.equal(parsed.model, "deepseek-v4-flash");
});

test("extractUsageFromAny accepts OpenAI and CloudBase-like shapes", () => {
  assert.deepEqual(extractUsageFromAny({
    usage: { prompt_tokens: 2, completion_tokens: 3, total_tokens: 5 },
  }), { promptTokens: 2, completionTokens: 3, totalTokens: 5 });
  assert.deepEqual(extractUsageFromAny({
    usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 6, totalTokenCount: 10 },
  }), { promptTokens: 4, completionTokens: 6, totalTokens: 10 });
  assert.deepEqual(extractUsageFromAny({
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    rawResponses: [{ usage: { prompt_tokens: 11, completion_tokens: 7, total_tokens: 18 } }],
  }), { promptTokens: 11, completionTokens: 7, totalTokens: 18 });
});

test("recordModelUsage writes token metrics without inventing requests", async () => {
  const metrics = [];
  await recordModelUsage({
    recordMetric: async (metric, value, meta) => {
      metrics.push({ metric, value, meta });
    },
  }, {
    model: "qwen3-vl-flash",
    feature: "vision",
    provider: "qwen",
    requests: 0,
    usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 },
  });
  assert.deepEqual(metrics.map((item) => item.metric).sort(), [
    "model_tokens",
    "model_tokens_input",
    "model_tokens_output",
  ]);
  assert.equal(metrics.find((item) => item.metric === "model_tokens").value, 15);
});
