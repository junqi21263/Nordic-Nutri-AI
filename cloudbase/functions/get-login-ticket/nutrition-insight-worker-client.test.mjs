import assert from "node:assert/strict";
import test from "node:test";

import {
  NutritionInsightWorkerClientError,
  createNutritionInsightWorkerClient,
} from "./nutrition-insight-worker-client.cjs";

test("signs a food-context request and returns the dev worker insight", async () => {
  const requests = [];
  const client = createNutritionInsightWorkerClient({
    endpoint: "https://dev-d8g3hqv2b0de38046.service.tcloudbase.com/nutrition-insight-worker/generate",
    sharedSecret: "worker-secret",
    now: () => 1_000_000,
    requestImpl: async (request) => {
      requests.push(request);
      return {
        statusCode: 200,
        body: JSON.stringify({
          headline: "鸡胸肉的营养参考",
          content: "每100g约含31g蛋白质，可搭配蔬菜和主食。",
          source: "hunyuan-exp",
          model: "hunyuan-2.0-instruct-20251111",
        }),
      };
    },
  });

  const result = await client.generateInsight({
    name: "鸡胸肉",
    category: "肉禽",
    nutritionPer100g: { proteinG: 31, carbsG: 0, fatG: 3.6, caloriesKcal: 165 },
  });

  assert.equal(result.source, "hunyuan-exp");
  assert.equal(result.model, "hunyuan-2.0-instruct-20251111");
  assert.equal(requests.length, 1);
  assert.equal(requests[0].headers["x-nordic-worker-timestamp"], "1000000");
  assert.match(requests[0].headers["x-nordic-worker-signature"], /^[a-f0-9]{64}$/);
  assert.deepEqual(JSON.parse(requests[0].body), {
    foodContext: {
      name: "鸡胸肉",
      category: "肉禽",
      nutritionPer100g: { proteinG: 31, carbsG: 0, fatG: 3.6, caloriesKcal: 165 },
    },
  });
});

test("rejects malformed dev worker responses", async () => {
  const client = createNutritionInsightWorkerClient({
    endpoint: "https://worker.example/generate",
    sharedSecret: "worker-secret",
    requestImpl: async () => ({ statusCode: 200, body: JSON.stringify({ headline: "only a headline" }) }),
  });

  await assert.rejects(
    () => client.generateInsight({ name: "鸡胸肉", nutritionPer100g: {} }),
    (error) => error instanceof NutritionInsightWorkerClientError && error.code === "NUTRITION_INSIGHT_WORKER_FAILED",
  );
});

test("rejects a non-HTTPS dev worker endpoint", () => {
  assert.throws(
    () => createNutritionInsightWorkerClient({ endpoint: "http://localhost:9000/generate", sharedSecret: "worker-secret" }),
    /HTTPS endpoint/,
  );
});

test("signs the three fixed coach-content requests against dev routes", async () => {
  const requests = [];
  const client = createNutritionInsightWorkerClient({
    endpoint: "https://dev.example/hunyuan-image-worker/nutrition-insight",
    sharedSecret: "worker-secret",
    now: () => 2_000_000,
    requestImpl: async (request) => {
      requests.push(request);
      const route = new URL(request.url).pathname;
      const responseByRoute = {
        "/hunyuan-image-worker/daily-insight": { focus: "protein", headline: "晚餐优先补蛋白", content: "还差约20g蛋白质，晚餐可加一份鱼或豆腐。" },
        "/hunyuan-image-worker/daily-tip": { type: "nutrition_tip", headline: "下一餐补蛋白", content: "午餐可搭配鸡蛋或豆腐。", food: null },
        "/hunyuan-image-worker/coach-quick-prompt": { prompt: "晚餐怎么补充蛋白质？" },
      };
      return { statusCode: 200, body: JSON.stringify({ ...responseByRoute[route], source: "hunyuan-exp", model: "hunyuan-2.0-instruct-20251111" }) };
    },
  });

  const [insight, tip, prompt] = await Promise.all([
    client.generateDailyInsight({ date: "2026-07-29", context: { daily: { remaining: { protein: 20 } } } }),
    client.generateDailyTip({ type: "nutrition_tip", context: { goalType: "muscle_gain" } }),
    client.generateCoachQuickPrompt({ context: { daily: { mealCount: 2 } } }),
  ]);

  assert.equal(insight.source, "hunyuan-exp");
  assert.equal(tip.type, "nutrition_tip");
  assert.equal(prompt.prompt, "晚餐怎么补充蛋白质？");
  assert.deepEqual(requests.map((request) => new URL(request.url).pathname).sort(), [
    "/hunyuan-image-worker/coach-quick-prompt",
    "/hunyuan-image-worker/daily-insight",
    "/hunyuan-image-worker/daily-tip",
  ]);
  for (const request of requests) assert.match(request.headers["x-nordic-worker-signature"], /^[a-f0-9]{64}$/);
});
