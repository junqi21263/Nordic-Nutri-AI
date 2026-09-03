import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { createWorkerHttpServer, createWorkerService, extractWorkerUsage, readWorkerConfig } from "./index.js";

async function withServer(server, run) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function signedHeaders(secret, body, timestamp = Date.now()) {
  const value = String(timestamp);
  return {
    "content-type": "application/json",
    "x-nordic-worker-timestamp": value,
    "x-nordic-worker-signature": createHmac("sha256", secret).update(`${value}.${body}`).digest("hex"),
  };
}

test("extractWorkerUsage reads nested rawResponses when top-level usage is zero", () => {
  assert.deepEqual(extractWorkerUsage({
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    rawResponses: [{ usage: { prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 } }],
  }), { promptTokens: 9, completionTokens: 4, totalTokens: 13 });
});

test("requires the worker environment id and shared secret", () => {
  assert.throws(
    () => readWorkerConfig({ TCB_ENV: "dev-env" }),
    /Worker configuration is incomplete/,
  );
});

test("passes an explicit CloudBase API key to the SDK in an HTTP runtime", () => {
  const initCalls = [];
  createWorkerService({
    TCB_ENV: "prod-env",
    AI_WORKER_SHARED_SECRET: "worker-secret",
    CLOUDBASE_APIKEY: "server-api-key",
  }, {
    cloudbaseNodeSdk: {
      init: (options) => {
        initCalls.push(options);
        return { ai: () => ({ createImageModel: () => ({}), createModel: () => ({}) }) };
      },
    },
  });
  assert.deepEqual(initCalls, [{ env: "prod-env", accessKey: "server-api-key" }]);
});

test("accepts a valid signed generation request without trusting the caller model", async () => {
  const calls = [];
  const server = createWorkerHttpServer({
    sharedSecret: "test-shared-secret",
    service: {
      generate: async (input) => {
        calls.push(input);
        return { data: [{ url: "https://temporary.example/image.png", revised_prompt: "revised" }] };
      },
    },
  });
  const body = JSON.stringify({
    model: "caller-controlled-model",
    prompt: "A Nordic plate of boiled chicken breast",
    size: "1280x720",
    seed: 123,
  });

  await withServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/generate`, {
      method: "POST",
      headers: signedHeaders("test-shared-secret", body),
      body,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      data: [{ url: "https://temporary.example/image.png", revised_prompt: "revised" }],
    });
  });

  assert.deepEqual(calls, [{
    prompt: "A Nordic plate of boiled chicken breast",
    size: "1280x720",
    seed: 123,
  }]);
});

test("accepts a signed nutrition-insight request through the existing dev worker", async () => {
  const calls = [];
  const server = createWorkerHttpServer({
    sharedSecret: "test-shared-secret",
    service: {
      generate: async () => assert.fail("image generation must not run"),
      generateInsight: async (foodContext) => {
        calls.push(foodContext);
        return { headline: "鸡胸肉的营养参考", content: "每100g约含31g蛋白质，可搭配蔬菜和主食。", source: "hunyuan-exp", model: "hunyuan-2.0-instruct-20251111" };
      },
    },
  });
  const body = JSON.stringify({
    foodContext: { name: "鸡胸肉", category: "肉禽", nutritionPer100g: { caloriesKcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6 } },
  });

  await withServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/nutrition-insight`, {
      method: "POST",
      headers: signedHeaders("test-shared-secret", body),
      body,
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).source, "hunyuan-exp");
  });

  assert.deepEqual(calls, [{ name: "鸡胸肉", category: "肉禽", nutritionPer100g: { caloriesKcal: 165, proteinG: 31, carbsG: 0, fatG: 3.6 } }]);
});

test("accepts signed fixed nutrition-content requests through the dev worker", async () => {
  const calls = [];
  const server = createWorkerHttpServer({
    sharedSecret: "test-shared-secret",
    service: {
      generate: async () => assert.fail("image generation must not run"),
      generateInsight: async () => assert.fail("food insight must not run"),
      generateDailyInsight: async (input) => {
        calls.push(["daily-insight", input]);
        return { focus: "protein", headline: "晚餐优先补蛋白", content: "还差约20g蛋白质，晚餐加一份鱼或豆腐。", source: "hunyuan-exp", model: "hunyuan-2.0-instruct-20251111" };
      },
      generateDailyTip: async (input) => {
        calls.push(["daily-tip", input]);
        return { type: "nutrition_tip", headline: "下一餐补一份蛋白质", content: "午餐可搭配鸡蛋或豆腐。", reason: "帮助完成今天的蛋白目标。", food: null, source: "hunyuan-exp", model: "hunyuan-2.0-instruct-20251111" };
      },
      generateCoachQuickPrompt: async (input) => {
        calls.push(["coach-quick-prompt", input]);
        return { prompt: "晚餐怎么补充蛋白质？", source: "hunyuan-exp", model: "hunyuan-2.0-instruct-20251111" };
      },
    },
  });
  const cases = [
    ["/daily-insight", { date: "2026-07-29", context: { daily: { remaining: { protein: 20 } } } }, "focus"],
    ["/daily-tip", { type: "nutrition_tip", context: { goalType: "muscle_gain" } }, "type"],
    ["/coach-quick-prompt", { context: { daily: { mealCount: 2 } } }, "prompt"],
  ];

  await withServer(server, async (baseUrl) => {
    for (const [path, payload, key] of cases) {
      const body = JSON.stringify(payload);
      const response = await fetch(`${baseUrl}${path}`, { method: "POST", headers: signedHeaders("test-shared-secret", body), body });
      assert.equal(response.status, 200);
      assert.equal(typeof (await response.json())[key], "string");
    }
  });

  assert.deepEqual(calls.map(([route]) => route), ["daily-insight", "daily-tip", "coach-quick-prompt"]);
});

test("rejects unsigned and stale generation requests", async () => {
  const server = createWorkerHttpServer({
    sharedSecret: "test-shared-secret",
    service: { generate: async () => ({ data: [] }) },
    now: () => 1_000_000,
  });
  const body = JSON.stringify({ prompt: "food", size: "1280x720" });

  await withServer(server, async (baseUrl) => {
    const unsigned = await fetch(`${baseUrl}/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    assert.equal(unsigned.status, 401);
    assert.deepEqual(await unsigned.json(), { code: "WORKER_UNAUTHORIZED" });

    const stale = await fetch(`${baseUrl}/generate`, {
      method: "POST",
      headers: signedHeaders("test-shared-secret", body, 1_000_000 - 301_000),
      body,
    });
    assert.equal(stale.status, 401);
    assert.deepEqual(await stale.json(), { code: "WORKER_UNAUTHORIZED" });
  });
});
