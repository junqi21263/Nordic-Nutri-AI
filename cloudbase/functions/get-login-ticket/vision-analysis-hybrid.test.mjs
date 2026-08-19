import assert from "node:assert/strict";
import test from "node:test";

import {
  createHybridVisionController,
  classifyAsyncTrigger,
  shouldUseHybrid,
} from "./vision-analysis-hybrid.cjs";

const analysisId = "11111111-1111-4111-8111-111111111111";

test("only a capable client with the feature flag can use hybrid", () => {
  assert.equal(shouldUseHybrid({ featureEnabled: false, supportsAsyncVision: true }), false);
  assert.equal(shouldUseHybrid({ featureEnabled: true, supportsAsyncVision: false }), false);
  assert.equal(shouldUseHybrid({ featureEnabled: true, supportsAsyncVision: true }), true);
});

test("classifies only transient provider failures for async fallback", () => {
  assert.equal(classifyAsyncTrigger({ code: "VISION_TIMEOUT" }), "fast_timeout");
  assert.equal(classifyAsyncTrigger({ code: "VISION_RETRYABLE", providerErrorType: "http", providerHttpStatus: 503 }), "provider_5xx");
  assert.equal(classifyAsyncTrigger({ code: "VISION_RETRYABLE", providerErrorType: "network" }), "transient_network");
  assert.equal(classifyAsyncTrigger({ code: "VISION_IMAGE_INVALID" }), null);
  assert.equal(classifyAsyncTrigger({ code: "VISION_CONTENT_BLOCKED" }), null);
});

test("fast timeout returns 202 only after durable async handoff", async () => {
  const calls = [];
  const controller = createHybridVisionController({
    featureEnabled: true,
    createAnalysis: async () => ({ analysisId, status: "created", reused: false }),
    runFast: async () => { throw Object.assign(new Error("deadline"), { code: "VISION_TIMEOUT" }); },
    handoff: async (input) => { calls.push(input); return { accepted: true }; },
  });

  const response = await controller.post({ supportsAsyncVision: true, clientRequestId: "client-1" });
  assert.deepEqual(response, {
    httpStatus: 202,
    body: { status: "processing", analysisId, currentStage: "analyzing", pollAfterMs: 1500 },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].resumeStage, "analyzing");
  assert.equal(calls[0].triggerReason, "fast_timeout");
});

test("handoff failure never returns a fake 202", async () => {
  const controller = createHybridVisionController({
    featureEnabled: true,
    createAnalysis: async () => ({ analysisId, status: "created", reused: false }),
    runFast: async () => { throw Object.assign(new Error("deadline"), { code: "VISION_TIMEOUT" }); },
    handoff: async () => ({ accepted: false }),
  });

  await assert.rejects(
    controller.post({ supportsAsyncVision: true, clientRequestId: "client-2" }),
    (error) => error.code === "VISION_TIMEOUT" && error.handoffAccepted === false,
  );
});

test("provider-success checkpoint resumes enriching without another provider call", async () => {
  const providerCalls = [];
  const controller = createHybridVisionController({
    featureEnabled: true,
    createAnalysis: async () => ({ analysisId, status: "created", reused: false }),
    runFast: async () => ({
      kind: "checkpoint",
      analysisId,
      providerResult: { mealName: "寿司", items: [{ name: "寿司", quantityG: 200 }] },
      resumeStage: "enriching",
    }),
    handoff: async (input) => {
      providerCalls.push(input.providerAttempt);
      return { accepted: true };
    },
  });

  const response = await controller.post({ supportsAsyncVision: true, clientRequestId: "client-3" });
  assert.equal(response.httpStatus, 202);
  assert.equal(response.body.currentStage, "enriching");
  assert.equal(providerCalls.length, 1);
  assert.equal(providerCalls[0], 1);
});

test("checkpoint handoff is attempted once when durability fails", async () => {
  let handoffCalls = 0;
  const controller = createHybridVisionController({
    featureEnabled: true,
    createAnalysis: async () => ({ analysisId, status: "created", reused: false }),
    runFast: async () => ({ kind: "checkpoint", providerResult: { mealName: "套餐" }, resumeStage: "enriching" }),
    handoff: async () => { handoffCalls += 1; return { accepted: false }; },
  });
  await assert.rejects(controller.post({ supportsAsyncVision: true, clientRequestId: "client-4" }));
  assert.equal(handoffCalls, 1);
});

test("downstream failure after provider success resumes enriching", async () => {
  const handoffs = [];
  const controller = createHybridVisionController({
    featureEnabled: true,
    createAnalysis: async () => ({ analysisId, status: "created", reused: false }),
    runFast: async () => {
      throw Object.assign(new Error("nutrition deadline"), {
        code: "VISION_TIMEOUT",
        resumeStage: "enriching",
        providerAttempt: 1,
      });
    },
    handoff: async (input) => { handoffs.push(input); return { accepted: true }; },
  });

  const response = await controller.post({ supportsAsyncVision: true });
  assert.equal(response.httpStatus, 202);
  assert.equal(response.body.currentStage, "enriching");
  assert.deepEqual(handoffs, [{
    analysisId,
    providerAttempt: 1,
    resumeStage: "enriching",
    triggerReason: "provider_success_budget_exhausted",
  }]);
});

test("reused completed and processing analyses do not call provider again", async () => {
  let providerCalls = 0;
  const controller = createHybridVisionController({
    featureEnabled: true,
    createAnalysis: async ({ mode }) => mode === "completed"
      ? { analysisId, status: "completed", reused: true, result: { mealName: "已有结果" } }
      : { analysisId, status: "analyzing", reused: true },
    runFast: async () => { providerCalls += 1; return { mealName: "不应调用" }; },
  });

  const completed = await controller.post({ supportsAsyncVision: true, clientRequestId: "completed", mode: "completed" });
  const processing = await controller.post({ supportsAsyncVision: true, clientRequestId: "processing", mode: "processing" });
  assert.equal(completed.httpStatus, 200);
  assert.equal(processing.httpStatus, 202);
  assert.equal(providerCalls, 0);
});
