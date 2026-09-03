import assert from "node:assert/strict";
import test from "node:test";
import { createAsyncVisionProcessor, createProductionVisionWorker, createWorker, createVisionWorkerRuntime, createWiredVisionWorker, main } from "./index.js";

test("worker foundation claims each job once and delegates processing", async () => {
  const processed = [];
  const worker = createWorker({
    claimJob: async () => [{ id: "a", dispatch_state: "running" }],
    processJob: async (job) => { processed.push(job.id); return { id: job.id, status: "completed" }; },
  });
  assert.deepEqual(await worker.processOnce(), { claimed: 1, results: [{ id: "a", status: "completed" }] });
  assert.deepEqual(processed, ["a"]);
});

test("worker entrypoint is disabled by default", async () => {
  const result = await main();
  assert.deepEqual(result, { skipped: true, reason: "feature_disabled" });
});

test("worker entrypoint delegates one local batch when explicitly enabled", async () => {
  const result = await main({
    enabled: true,
    processOnce: async () => ({ claimed: 1, results: [{ status: "completed" }] }),
  });
  assert.deepEqual(result, { claimed: 1, results: [{ status: "completed" }] });
});

test("worker entrypoint processes the already-claimed job without claiming again", async () => {
  let claimCalls = 0;
  const result = await main({
    enabled: true,
    job: { id: "analysis-claimed", execution_owner: "async", status: "analyzing", image_path: "cloud://env/image.jpg" },
    runtimeFactory: () => ({
      visionAnalysisFoundation: {
        claimQueuedJob: async () => { claimCalls += 1; return []; },
        completeAsyncAnalysis: async () => ({ accepted: true }),
        commitQuota: async () => {},
      },
      vision: { analyzeImage: async (_userId, input) => ({ analysisId: input.analysisId }) },
      resolveVisionImageUrl: async () => "https://storage.example/image.jpg",
    }),
  });
  assert.equal(claimCalls, 0);
  assert.equal(result.claimed, 1);
});

test("worker entrypoint loads a flat dispatcher invocation as the already-claimed job", async () => {
  let claimCalls = 0;
  let loadedInput = null;
  const result = await main({
    enabled: true,
    analysisId: "analysis-flat",
    jobId: "job-flat",
    version: 4,
    leaseUntil: "2026-08-18T10:00:00Z",
    runtimeFactory: () => ({
      visionAnalysisFoundation: {
        claimQueuedJob: async () => { claimCalls += 1; return []; },
        loadClaimedJob: async (input) => {
          loadedInput = input;
          return {
            id: "analysis-flat",
            job_id: "job-flat",
            version: 4,
            lease_until: "2026-08-18T10:00:00Z",
            user_id: "user-1",
            status: "analyzing",
            execution_owner: "async",
            dispatch_state: "running",
            image_path: "cloud://env/image.jpg",
          };
        },
        completeAsyncAnalysis: async () => ({ accepted: true }),
        commitQuota: async () => {},
      },
      vision: { analyzeImage: async (_userId, input) => ({ analysisId: input.analysisId }) },
      resolveVisionImageUrl: async () => "https://storage.example/image.jpg",
    }),
  });
  assert.equal(claimCalls, 0);
  assert.deepEqual(loadedInput, {
    analysisId: "analysis-flat",
    jobId: "job-flat",
    version: 4,
    leaseUntil: "2026-08-18T10:00:00Z",
  });
  assert.equal(result.claimed, 1);
});

test("enriching resume reuses provider checkpoint without a second provider call", async () => {
  let providerCalls = 0;
  let persisted = null;
  const processor = createAsyncVisionProcessor({
    runProvider: async () => { providerCalls += 1; return { mealName: "不应再次识别" }; },
    enrich: async (result) => ({ ...result, enriched: true }),
    persist: async (job, result) => { persisted = { job, result }; return { status: "completed" }; },
  });
  const result = await processor.process({
    id: "analysis-1", status: "enriching", execution_owner: "async", resume_stage: "enriching",
    provider_checkpoint: { mealName: "已识别", items: [] },
  });
  assert.equal(providerCalls, 0);
  assert.equal(result.status, "completed");
  assert.equal(persisted.result.enriched, true);
});

test("analyzing resume makes one independent async provider attempt", async () => {
  let providerCalls = 0;
  const processor = createAsyncVisionProcessor({
    runProvider: async (job) => { providerCalls += 1; return { mealName: job.id }; },
    enrich: async (result) => result,
    persist: async () => ({ status: "completed" }),
  });
  const result = await processor.process({ id: "analysis-2", status: "analyzing", execution_owner: "async", resume_stage: "analyzing" });
  assert.equal(providerCalls, 1);
  assert.equal(result.status, "completed");
});

test("worker does not write terminal or non-async jobs", async () => {
  let calls = 0;
  const processor = createAsyncVisionProcessor({
    runProvider: async () => { calls += 1; return {}; },
    enrich: async (result) => result,
    persist: async () => { calls += 1; return {}; },
  });
  const terminal = await processor.process({ id: "analysis-3", status: "completed", execution_owner: "none" });
  const nonAsync = await processor.process({ id: "analysis-4", status: "analyzing", execution_owner: "fast" });
  assert.equal(terminal.status, "noop");
  assert.equal(nonAsync.status, "noop");
  assert.equal(calls, 0);
});

test("wired worker resumes stored enriching jobs without calling provider again", async () => {
  let providerCalls = 0;
  const events = [];
  const diagnostics = [];
  const worker = createWiredVisionWorker({
    claimJob: async () => [{
      id: "analysis-5",
      user_id: "user-1",
      client_request_id: "11111111-1111-4111-8111-111111111111",
      status: "enriching",
      execution_owner: "async",
      resume_stage: "enriching",
      image_path: "cloud://env/food-images/user-1/image.jpg",
      image_sha256: "a".repeat(64),
      provider_checkpoint: { mealName: "套餐", items: [] },
      provider_attempt: 1,
    }],
    resolveImageUrl: async (path) => `https://storage.example/${path.split("/").pop()}`,
    vision: {
      analyzeImage: async (userId, input) => {
        providerCalls += 1;
        events.push({ userId, input });
        return { analysisId: input.analysisId, mealName: "套餐", items: [], providerAttempt: input.providerAttempt };
      },
    },
    commitQuota: async (analysisId) => events.push({ commitQuota: analysisId }),
    completeJob: async (job, result) => events.push({ completeJob: job.id, result }),
    releaseQuota: async () => { throw new Error("must not release on success"); },
    diagnostics: { onStage: (event) => diagnostics.push(event) },
  });

  const result = await worker.processOnce();
  assert.equal(result.claimed, 1);
  assert.equal(events[0].input.storedImageUrl, "https://storage.example/image.jpg");
  assert.equal(events[0].input.providerCheckpoint.mealName, "套餐");
  assert.equal(events.some((event) => event.commitQuota === "analysis-5"), true);
  assert.equal(events.some((event) => event.completeJob === "analysis-5"), true);
  assert.equal(providerCalls, 1, "the vision pipeline is invoked to enrich the checkpoint, but must not make a provider call");
  assert.equal(events.find((event) => event.completeJob === "analysis-5").result?.providerAttempt, 1);
  assert.equal(events[0].input.providerAttempt, 1);
  assert.equal(diagnostics.some((event) => event.stage === "worker.provider_start"), false);
  assert.equal(diagnostics.some((event) => event.stage === "worker.checkpoint_resume" && event.status === "succeeded"), true);
});

test("worker runtime wires foundation claim, quota, and CAS terminal transitions", async () => {
  const calls = [];
  const runtime = createVisionWorkerRuntime({
    foundation: {
      claimQueuedJob: async () => [{ id: "analysis-6", user_id: "user-1", client_request_id: "11111111-1111-4111-8111-111111111111", status: "analyzing", execution_owner: "async", resume_stage: "analyzing", image_path: "cloud://env/image.jpg", version: 4 }],
      commitQuota: async (id) => calls.push(["commit", id]),
      releaseQuota: async (id) => calls.push(["release", id]),
      completeAsyncAnalysis: async (input) => calls.push(["complete", input.analysisId, input.expectedVersion]),
      failAsyncAnalysis: async (input) => calls.push(["fail", input.analysisId, input.expectedVersion]),
    },
    resolveImageUrl: async () => "https://storage.example/image.jpg",
    vision: { analyzeImage: async (_userId, input) => ({ analysisId: input.analysisId, mealName: "米饭", items: [] }) },
  });
  const result = await runtime.processOnce();
  assert.equal(result.results[0].status, "completed");
  assert.deepEqual(calls, [["complete", "analysis-6", 4], ["commit", "analysis-6"]]);
});

test("missing image path fails the async job and releases its quota reservation", async () => {
  const calls = [];
  const worker = createWiredVisionWorker({
    claimJob: async () => [{
      id: "analysis-missing-image",
      user_id: "user-1",
      client_request_id: "11111111-1111-4111-8111-111111111111",
      status: "analyzing",
      execution_owner: "async",
      version: 9,
      image_path: null,
    }],
    resolveImageUrl: async () => { throw new Error("must not resolve a missing path"); },
    vision: { analyzeImage: async () => { throw new Error("must not call provider"); } },
    completeJob: async () => { throw new Error("must not complete"); },
    failJob: async (job, error) => calls.push(["fail", job.id, error.code]),
    releaseQuota: async (id) => calls.push(["release", id]),
  });

  await assert.rejects(worker.processOnce(), (error) => error.code === "VISION_ASSET_PATH_MISSING");
  assert.deepEqual(calls, [
    ["fail", "analysis-missing-image", "VISION_ASSET_PATH_MISSING"],
    ["release", "analysis-missing-image"],
  ]);
});

test("expired async deadline stops before the second provider attempt", async () => {
  let providerCalls = 0;
  const calls = [];
  const runtime = createVisionWorkerRuntime({
    foundation: {
      claimQueuedJob: async () => [{
        id: "analysis-expired",
        user_id: "user-1",
        client_request_id: "11111111-1111-4111-8111-111111111111",
        status: "analyzing",
        execution_owner: "async",
        resume_stage: "analyzing",
        image_path: "cloud://env/image.jpg",
        version: 5,
        deadline_at: new Date(Date.now() - 1_000).toISOString(),
      }],
      completeAsyncAnalysis: async () => { throw new Error("must not complete"); },
      failAsyncAnalysis: async (input) => { calls.push(["fail", input.analysisId, input.expectedVersion, input.status]); },
      commitQuota: async () => { throw new Error("must not commit"); },
      releaseQuota: async (id) => calls.push(["release", id]),
    },
    resolveImageUrl: async () => "https://storage.example/image.jpg",
    vision: { analyzeImage: async () => { providerCalls += 1; return {}; } },
  });

  await assert.rejects(runtime.processOnce(), (error) => error.code === "VISION_ASYNC_DEADLINE_EXPIRED");
  assert.equal(providerCalls, 0);
  assert.deepEqual(calls, [
    ["fail", "analysis-expired", 5, "timed_out"],
    ["release", "analysis-expired"],
  ]);
});

test("delayed dispatcher claim still reaches provider while async deadline remains valid", async () => {
  let providerCalls = 0;
  const runtime = createVisionWorkerRuntime({
    foundation: {
      claimQueuedJob: async () => [{
        id: "analysis-delayed",
        user_id: "user-1",
        client_request_id: "11111111-1111-4111-8111-111111111111",
        status: "analyzing",
        execution_owner: "async",
        resume_stage: "analyzing",
        image_path: "cloud://env/image.jpg",
        version: 5,
        // Models the one-minute dispatcher fallback plus a five-second jitter.
        deadline_at: new Date(Date.now() + 65_000).toISOString(),
      }],
      completeAsyncAnalysis: async () => ({ accepted: true }),
      failAsyncAnalysis: async () => { throw new Error("must not fail"); },
      commitQuota: async () => {},
      releaseQuota: async () => { throw new Error("must not release"); },
    },
    resolveImageUrl: async () => "https://storage.example/image.jpg",
    vision: { analyzeImage: async (_userId, input) => { providerCalls += 1; return { analysisId: input.analysisId, items: [] }; } },
  });

  const result = await runtime.processOnce();
  assert.equal(result.results[0].status, "completed");
  assert.equal(providerCalls, 1);
});

test("production worker factory wires the runtime service without exposing secrets", async () => {
  const runtime = createProductionVisionWorker({
    runtimeFactory: () => ({
      visionAnalysisFoundation: {
        claimQueuedJob: async () => [],
      },
      vision: { analyzeImage: async () => ({}) },
      resolveVisionImageUrl: async () => null,
    }),
  });
  assert.deepEqual(await runtime.processOnce(), { claimed: 0, results: [] });
});

test("enabled worker entrypoint uses the production runtime factory", async () => {
  const result = await main({
    enabled: true,
    runtimeFactory: () => ({
      visionAnalysisFoundation: { claimQueuedJob: async () => [] },
      vision: { analyzeImage: async () => ({}) },
      resolveVisionImageUrl: async () => null,
    }),
  });
  assert.deepEqual(result, { claimed: 0, results: [] });
});

test("enabled production worker emits safe diagnostics to the runtime logger by default", async () => {
  const lines = [];
  const originalLog = console.log;
  console.log = (line) => lines.push(line);
  try {
    await main({
      enabled: true,
      runtimeFactory: () => ({
        visionAnalysisFoundation: { claimQueuedJob: async () => [] },
        vision: { analyzeImage: async () => ({}) },
        resolveVisionImageUrl: async () => null,
      }),
    });
  } finally {
    console.log = originalLog;
  }
  assert.equal(lines.some((line) => line.includes("[vision-worker-stage]") && line.includes("worker.claim")), true);
  assert.equal(lines.some((line) => line.includes("Authorization") || line.includes("storedImageUrl") || line.includes("base64")), false);
});

test("worker diagnostics records the five pre-provider stages without sensitive payloads", async () => {
  const events = [];
  const worker = createWiredVisionWorker({
    diagnostics: { onStage: (event) => events.push(event) },
    claimJob: async () => [{
      id: "analysis-diagnostic-1",
      job_id: "job-diagnostic-1",
      trace_id: "trace-diagnostic-1",
      user_id: "user-1",
      client_request_id: "11111111-1111-4111-8111-111111111111",
      status: "analyzing",
      execution_owner: "async",
      resume_stage: "analyzing",
      image_path: "cloud://env/food-images/user-1/image.jpg",
      content_type: "image/jpeg",
      byte_size: 296440,
      version: 4,
      deadline_at: new Date(Date.now() + 60_000).toISOString(),
    }],
    resolveImageUrl: async () => "https://storage.example/image.jpg",
    vision: { analyzeImage: async (_userId, input) => ({ analysisId: input.analysisId, mealName: "套餐", items: [] }) },
    completeJob: async () => ({ accepted: true }),
    commitQuota: async () => {},
  });

  await worker.processOnce();

  assert.deepEqual(events.map((event) => `${event.stage}:${event.status}`), [
    "worker.claim:started",
    "worker.claim:succeeded",
    "worker.asset_load:started",
    "worker.asset_load:succeeded",
    "worker.temp_url:started",
    "worker.temp_url:succeeded",
    "worker.deadline_check:started",
    "worker.deadline_check:succeeded",
    "worker.provider_start:started",
    "worker.provider_start:succeeded",
  ]);
  for (const event of events.filter((event) => event.stage !== "worker.claim")) {
    assert.equal(event.analysisId, "analysis-diagnostic-1");
    assert.equal(event.jobId, "job-diagnostic-1");
    assert.equal(event.traceId, "trace-diagnostic-1");
    assert.equal(typeof event.startedAt, "string");
    assert.equal(typeof event.durationMs, "number");
    assert.equal(event.imagePath, undefined);
    assert.equal(event.url, undefined);
    assert.equal(event.token, undefined);
  }
  const deadline = events.find((event) => event.stage === "worker.deadline_check" && event.status === "succeeded");
  assert.equal(deadline.decision, "continue");
  assert.equal(deadline.version, 4);
  assert.equal(typeof deadline.remainingMs, "number");
});

test("worker diagnostics records a safe temp URL failure and stops before provider start", async () => {
  const events = [];
  const worker = createWiredVisionWorker({
    diagnostics: { onStage: (event) => events.push(event) },
    claimJob: async () => [{
      id: "analysis-diagnostic-2",
      job_id: "job-diagnostic-2",
      trace_id: "trace-diagnostic-2",
      status: "analyzing",
      execution_owner: "async",
      resume_stage: "analyzing",
      image_path: "cloud://env/missing.jpg",
      version: 7,
    }],
    resolveImageUrl: async () => { throw Object.assign(new Error("missing"), { code: "VISION_ASSET_NOT_FOUND" }); },
    vision: { analyzeImage: async () => { throw new Error("must not call provider"); } },
    failJob: async () => {},
    releaseQuota: async () => {},
  });

  await assert.rejects(() => worker.processOnce(), /missing/);
  const failure = events.find((event) => event.stage === "worker.temp_url" && event.status === "failed");
  assert.equal(failure.safeErrorCode, "VISION_ASSET_NOT_FOUND");
  assert.equal(events.some((event) => event.stage === "worker.provider_start"), false);
});

test("worker diagnostics records an expired deadline decision and prevents provider execution", async () => {
  const events = [];
  let providerCalled = false;
  const worker = createWiredVisionWorker({
    diagnostics: { onStage: (event) => events.push(event) },
    claimJob: async () => [{
      id: "analysis-diagnostic-3",
      job_id: "job-diagnostic-3",
      trace_id: "trace-diagnostic-3",
      status: "analyzing",
      execution_owner: "async",
      resume_stage: "analyzing",
      image_path: "cloud://env/image.jpg",
      version: 8,
      deadline_at: new Date(Date.now() - 1_000).toISOString(),
    }],
    resolveImageUrl: async () => "https://storage.example/image.jpg",
    vision: { analyzeImage: async () => { providerCalled = true; return { analysisId: "analysis-diagnostic-3" }; } },
    completeJob: async () => ({ accepted: true }),
    commitQuota: async () => {},
  });

  await assert.rejects(worker.processOnce(), (error) => error.code === "VISION_ASYNC_DEADLINE_EXPIRED");

  const deadline = events.find((event) => event.stage === "worker.deadline_check" && event.status === "succeeded");
  assert.equal(deadline.decision, "stop");
  assert.equal(providerCalled, false);
  assert.equal(events.some((event) => event.stage === "worker.provider_start"), false);
});
