import assert from "node:assert/strict";
import test from "node:test";

import {
  ANALYSIS_STATUSES,
  EXECUTION_OWNERS,
  DISPATCH_STATES,
  createVisionAnalysisService,
  mapAnalysisStatus,
  isTerminalAnalysisStatus,
  computeReservationExpiry,
} from "./vision-analysis-foundation.cjs";

const analysisId = "11111111-1111-4111-8111-111111111111";
const clientRequestId = "22222222-2222-4222-8222-222222222222";

test("maps legacy succeeded to completed and keeps terminal states stable", () => {
  assert.equal(mapAnalysisStatus("succeeded"), "completed");
  assert.equal(mapAnalysisStatus("completed"), "completed");
  assert.equal(isTerminalAnalysisStatus("failed"), true);
  assert.equal(isTerminalAnalysisStatus("processing"), false);
  assert.deepEqual(ANALYSIS_STATUSES, [
    "created", "uploaded", "analyzing", "enriching", "persisting",
    "completed", "failed", "timed_out", "cancelled",
  ]);
});

test("reservation expiry is later than the analysis deadline plus grace", () => {
  const deadlineAt = new Date("2026-08-17T10:00:30.000Z");
  const expiry = computeReservationExpiry(deadlineAt, 45_000);
  assert.equal(expiry.toISOString(), "2026-08-17T10:01:15.000Z");
});

test("createVisionAnalysis is an idempotent RPC boundary", async () => {
  const calls = [];
  const service = createVisionAnalysisService({
    db: {
      rpc: async (name, params) => {
        calls.push({ name, params });
        return { data: [{ analysis_id: analysisId, status: "created", quota_state: "reserved", reused: false }] };
      },
    },
    featureEnabled: false,
  });

  const result = await service.createVisionAnalysis({
    userId: "user-1",
    clientRequestId,
    provider: "qwen",
    model: "qwen3-vl-flash",
  });

  assert.equal(result.analysisId, analysisId);
  assert.equal(result.status, "created");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, "create_vision_analysis");
  assert.equal(calls[0].params.p_client_request_id, clientRequestId);
});

test("owned status lookup is read-only and maps terminal response", async () => {
  const service = createVisionAnalysisService({
    db: {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: async () => ({ data: [{ id: analysisId, status: "succeeded", error_code: null }], error: null }),
          }),
        }),
      }),
    },
    featureEnabled: true,
  });

  const result = await service.getOwnedAnalysis("user-1", analysisId);
  assert.equal(result.status, "completed");
  assert.equal(result.analysisId, analysisId);
});

test("owned completed status exposes the persisted result shape", async () => {
  const service = createVisionAnalysisService({
    db: {
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: async () => ({ data: [{
              id: analysisId,
              status: "completed",
              raw_recognition: { mealName: "套餐", mealType: "lunch", confidence: 0.8 },
              normalized_items: [{ name: "米饭", quantityG: 150 }],
              advice: "适量",
              image_path: "cloud://env/image.jpg",
            }], error: null }),
          }),
        }),
      }),
    },
    featureEnabled: true,
  });
  const result = await service.getOwnedAnalysis("user-1", analysisId);
  assert.equal(result.result.mealName, "套餐");
  assert.deepEqual(result.result.items, [{ name: "米饭", quantityG: 150 }]);
  assert.equal(result.result.advice, "适量");
});

test("foundation exports explicit ownership and dispatch vocabularies", () => {
  assert.deepEqual(EXECUTION_OWNERS, ["fast", "async", "none"]);
  assert.deepEqual(DISPATCH_STATES, ["none", "queued", "claimed", "running", "completed", "failed"]);
});

test("checkpoint and queue use versioned CAS RPCs when a version is supplied", async () => {
  const calls = [];
  const service = createVisionAnalysisService({
    db: {
      rpc: async (name, params) => {
        calls.push({ name, params });
        return { data: [{ accepted: true, analysis_id: analysisId, version: 4 }] };
      },
    },
  });

  const checkpoint = await service.checkpointProvider({
    analysisId,
    expectedVersion: 3,
    providerResult: { mealName: "寿司" },
    providerAttempt: 1,
  });
  const queued = await service.queueAsyncAnalysis({
    analysisId,
    expectedVersion: 4,
    resumeStage: "enriching",
    triggerReason: "provider_success_budget_exhausted",
    providerAttempt: 1,
  });

  assert.equal(checkpoint.version, 4);
  assert.equal(queued.version, 4);
  assert.equal(calls[0].name, "checkpoint_vision_analysis");
  assert.equal(calls[0].params.p_expected_version, 3);
  assert.equal(calls[1].name, "queue_vision_analysis");
  assert.equal(calls[1].params.p_expected_version, 4);
});

test("async terminal transitions use versioned completion/failure RPCs", async () => {
  const calls = [];
  const service = createVisionAnalysisService({
    db: {
      rpc: async (name, params) => {
        calls.push({ name, params });
        return { data: [{ accepted: true, analysis_id: analysisId, version: 8 }] };
      },
    },
  });
  await service.completeAsyncAnalysis({ analysisId, expectedVersion: 7, response: { mealName: "套餐", items: [] } });
  await service.failAsyncAnalysis({ analysisId, expectedVersion: 8, errorCode: "VISION_TIMEOUT", status: "timed_out" });
  assert.equal(calls[0].name, "complete_vision_analysis");
  assert.equal(calls[0].params.p_expected_version, 7);
  assert.equal(calls[1].name, "fail_vision_analysis");
  assert.equal(calls[1].params.p_status, "timed_out");
});
