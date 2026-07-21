import assert from "node:assert/strict";
import test from "node:test";

import { createDeepseekCoachService } from "./deepseek-coach-service.cjs";

test("returns a bounded nutrition-coach answer using server context", async () => {
  const requests = [];
  const answer = createDeepseekCoachService({
    apiKey: "test-key",
    requestCompletion: async (request) => { requests.push(request); return "晚餐可以补充鸡胸肉和一份主食。"; },
  });

  const result = await answer({ prompt: "晚餐吃什么？", context: { remainingProteinG: 40 }, history: [] });

  assert.equal(result, "晚餐可以补充鸡胸肉和一份主食。");
  assert.equal(requests[0].prompt, "晚餐吃什么？");
});

test("rejects empty prompts and unsafe-sized model output", async () => {
  const answer = createDeepseekCoachService({
    apiKey: "test-key",
    requestCompletion: async () => "x".repeat(2001),
  });

  await assert.rejects(() => answer({ prompt: "", context: {}, history: [] }), /无效/);
  await assert.rejects(() => answer({ prompt: "建议", context: {}, history: [] }), /暂不可用/);
});

test("uses the supported V4 Flash model in non-thinking mode by default", async () => {
  let body;
  const answer = createDeepseekCoachService({
    apiKey: "test-key",
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return { ok: true, json: async () => ({ choices: [{ message: { content: "建议正常吃饭。" } }] }) };
    },
  });

  await answer({ prompt: "今天怎么吃？", context: {}, history: [] });
  assert.equal(body.model, "deepseek-v4-flash");
  assert.deepEqual(body.thinking, { type: "disabled" });
});
