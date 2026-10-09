import assert from "node:assert/strict";
import test from "node:test";

import {
  createDeepseekNutritionPlanService,
  normalizePlan,
} from "./deepseek-nutrition-plan-service.cjs";

test("nutrition cancellation reaches the upstream transport", async () => {
  const controller = new AbortController();
  let upstreamSignal;
  const service = createDeepseekNutritionPlanService({
    apiKey: "test-key", routeManaged: true,
    fetchImpl: async (_url, { signal }) => {
      upstreamSignal = signal;
      controller.abort();
      return { ok: false };
    },
  });
  await assert.rejects(service({}, { signal: controller.signal }));
  assert.equal(upstreamSignal.aborted, true);
});

test("accepts a balanced AI nutrition plan payload", () => {
  const plan = normalizePlan({
    calories: 2500,
    proteinG: 150,
    carbsG: 275,
    fatG: 69,
    insight: "按增肌目标给出适度盈余。",
  });
  assert.ok(plan);
  assert.equal(plan.calories, 2500);
  assert.equal(plan.source, "deepseek");
});

test("rejects macros that diverge too far from calories", () => {
  const plan = normalizePlan({
    calories: 2500,
    proteinG: 50,
    carbsG: 50,
    fatG: 20,
    insight: "bad",
  });
  assert.equal(plan, null);
});

test("uses the configured route timeout for nutrition plan requests", async () => {
  let configuredTimeoutMs = null;
  const service = createDeepseekNutritionPlanService({
    apiKey: "test-key",
    model: "deepseek-v4-flash",
    route: { timeoutMs: 30_000 },
    setTimeoutImpl: (_callback, timeoutMs) => {
      configuredTimeoutMs = timeoutMs;
      return 1;
    },
    clearTimeoutImpl: () => {},
    fetchImpl: async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ calories: 2500, proteinG: 150, carbsG: 275, fatG: 69, insight: "按目标计算。" }) } }],
    }), { status: 200, headers: { "content-type": "application/json" } }),
  });

  const plan = await service({
    age: 30,
    sex: "male",
    heightCm: 175,
    weightKg: 70,
    activityLevel: "moderate",
    trainingDays: 3,
    goalType: "maintenance",
  });

  assert.equal(plan.source, "deepseek");
  assert.equal(configuredTimeoutMs, 30_000);
});
