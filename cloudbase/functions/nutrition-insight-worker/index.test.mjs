import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import http from "node:http";
import { once } from "node:events";
import test from "node:test";

import {
  createWorkerHttpServer,
  createWorkerService,
} from "./index.js";

function signedHeaders(secret, raw, timestamp = Date.now()) {
  return {
    "content-type": "application/json",
    "x-nordic-worker-timestamp": String(timestamp),
    "x-nordic-worker-signature": createHmac("sha256", secret).update(`${timestamp}.${raw}`).digest("hex"),
  };
}

async function withServer(server, run) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

function request(url, { method = "POST", headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = http.request({
      hostname: target.hostname,
      port: target.port,
      path: target.pathname,
      method,
      headers,
    }, (res) => {
      let response = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => { response += chunk; });
      res.on("end", () => resolve({ statusCode: res.statusCode, body: response }));
    });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

test("dev worker accepts a signed food context and returns its model insight", async () => {
  const secret = "worker-secret";
  const seen = [];
  const server = createWorkerHttpServer({
    sharedSecret: secret,
    service: {
      sharedSecret: secret,
      generate: async (foodContext) => {
        seen.push(foodContext);
        return { headline: "鸡胸肉的蛋白质参考", content: "每100g蛋白质较高，可搭配蔬菜和主食。", source: "hunyuan-exp", model: "hunyuan-2.0-instruct-20251111" };
      },
    },
  });
  const foodContext = { name: "鸡胸肉", category: "肉禽", nutritionPer100g: { proteinG: 31, carbsG: 0, fatG: 3.6, caloriesKcal: 165 } };
  const raw = JSON.stringify({ foodContext });

  await withServer(server, async (baseUrl) => {
    const response = await request(`${baseUrl}/generate`, { body: raw, headers: signedHeaders(secret, raw) });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), {
      headline: "鸡胸肉的蛋白质参考",
      content: "每100g蛋白质较高，可搭配蔬菜和主食。",
      source: "hunyuan-exp",
      model: "hunyuan-2.0-instruct-20251111",
    });
  });
  assert.deepEqual(seen, [foodContext]);
});

test("dev worker rejects unsigned requests before generation", async () => {
  const server = createWorkerHttpServer({
    sharedSecret: "worker-secret",
    service: { sharedSecret: "worker-secret", generate: async () => assert.fail("must not generate") },
  });

  await withServer(server, async (baseUrl) => {
    const response = await request(`${baseUrl}/generate`, {
      body: JSON.stringify({ foodContext: { name: "鸡胸肉", nutritionPer100g: {} } }),
      headers: { "content-type": "application/json" },
    });
    assert.equal(response.statusCode, 401);
    assert.deepEqual(JSON.parse(response.body), { code: "WORKER_UNAUTHORIZED" });
  });
});

test("dev worker uses the Growth Plan hunyuan-exp model group", async () => {
  const calls = [];
  const service = createWorkerService({
    TCB_ENV: "dev-d8g3hqv2b0de38046",
    AI_TEXT_WORKER_SHARED_SECRET: "worker-secret",
  }, {
    cloudbaseNodeSdk: {
      init: ({ env }) => ({
        ai: () => ({
          createModel: (groupName) => ({
            generateText: async (input) => {
              calls.push({ env, groupName, input });
              return { text: JSON.stringify({ headline: "鸡胸肉的营养参考", content: "每100g含31g蛋白质，可搭配蔬菜与主食。" }) };
            },
          }),
        }),
      }),
    },
  });

  const insight = await service.generate({ name: "鸡胸肉", category: "肉禽", nutritionPer100g: { proteinG: 31, carbsG: 0, fatG: 3.6, caloriesKcal: 165 } });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].env, "dev-d8g3hqv2b0de38046");
  assert.equal(calls[0].groupName, "hunyuan-exp");
  assert.equal(calls[0].input.model, "hunyuan-2.0-instruct-20251111");
  assert.equal(insight.source, "hunyuan-exp");
});
