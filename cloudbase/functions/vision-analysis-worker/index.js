const WORKER_DIAGNOSTIC_STAGES = new Set([
  "worker.entry",
  "worker.claimed_job_validate",
  "worker.claim",
  "worker.asset_load",
  "worker.temp_url",
  "worker.deadline_check",
  "worker.provider_start",
  "worker.checkpoint_resume",
]);

const ASYNC_PROVIDER_MAX_TIMEOUT_MS = 18_000;

function createWorkerDiagnosticEmitter(diagnostics) {
  const onStage = typeof diagnostics?.onStage === "function" ? diagnostics.onStage : null;
  return (event) => {
    if (!onStage || !WORKER_DIAGNOSTIC_STAGES.has(event.stage)) return;
    try {
      onStage({ ...event });
    } catch {
      // Diagnostics must never change worker behavior.
    }
  };
}

function createDefaultWorkerDiagnostics(logger = console) {
  return {
    onStage: (event) => logger.log(`[vision-worker-stage] ${JSON.stringify(event)}`),
  };
}

function createPersistentWorkerDiagnostics({ logger = console, recordDiagnostic } = {}) {
  return {
    onStage: (event) => {
      logger.log(`[vision-worker-stage] ${JSON.stringify(event)}`);
      Promise.resolve(recordDiagnostic?.(event)).catch(() => {});
    },
  };
}

function diagnosticIdentity(job = {}) {
  return {
    analysisId: job.id || null,
    jobId: job.job_id || null,
    traceId: job.trace_id || job.traceId || null,
    version: Number.isFinite(Number(job.version)) ? Number(job.version) : null,
  };
}

function safeErrorCode(error) {
  const candidate = error?.code ?? error?.errorCode ?? error?.statusCode;
  const code = typeof candidate === "string" || typeof candidate === "number" ? String(candidate) : "WORKER_STAGE_FAILED";
  return /^[A-Z0-9_:-]{1,80}$/.test(code) ? code : "WORKER_STAGE_FAILED";
}

function createStageRecorder(diagnostics, job) {
  const emit = createWorkerDiagnosticEmitter(diagnostics);
  return (stage, operation, extra = () => ({})) => {
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    emit({ stage, status: "started", startedAt, durationMs: 0, ...diagnosticIdentity(job) });
    return Promise.resolve()
      .then(operation)
      .then((value) => {
        emit({
          stage,
          status: "succeeded",
          startedAt,
          durationMs: Math.max(0, Date.now() - startedMs),
          ...diagnosticIdentity(job),
          ...extra(),
        });
        return value;
      })
      .catch((error) => {
        emit({
          stage,
          status: "failed",
          startedAt,
          durationMs: Math.max(0, Date.now() - startedMs),
          safeErrorCode: safeErrorCode(error),
          ...diagnosticIdentity(job),
        });
        throw error;
      });
  };
}

function createWorker({ claimJob, processJob, diagnostics } = {}) {
  if (typeof claimJob !== "function" || typeof processJob !== "function") {
    throw new Error("VISION_WORKER_DEPENDENCIES_MISSING");
  }
  const emit = createWorkerDiagnosticEmitter(diagnostics);
  return {
    async processOnce(input = {}) {
      const startedAt = new Date().toISOString();
      const startedMs = Date.now();
      emit({ stage: "worker.claim", status: "started", startedAt, durationMs: 0, analysisId: null, jobId: null, traceId: null, version: null });
      let jobs;
      try {
        jobs = await claimJob({ limit: input.limit ?? 1, leaseSeconds: input.leaseSeconds ?? 60 });
        if (jobs?.length) {
          for (const job of jobs) {
            emit({
              stage: "worker.claim",
              status: "succeeded",
              startedAt,
              durationMs: Math.max(0, Date.now() - startedMs),
              ...diagnosticIdentity(job),
            });
          }
        } else {
          emit({ stage: "worker.claim", status: "succeeded", startedAt, durationMs: Math.max(0, Date.now() - startedMs), analysisId: null, jobId: null, traceId: null, version: null });
        }
      } catch (error) {
        emit({ stage: "worker.claim", status: "failed", startedAt, durationMs: Math.max(0, Date.now() - startedMs), safeErrorCode: safeErrorCode(error), analysisId: null, jobId: null, traceId: null, version: null });
        throw error;
      }
      const results = [];
      for (const job of jobs || []) results.push(await processJob(job));
      return { claimed: jobs?.length ?? 0, results };
    },
    async processClaimedJob(job) {
      emit({ stage: "worker.claim", status: "succeeded", startedAt: new Date().toISOString(), durationMs: 0, ...diagnosticIdentity(job) });
      return { claimed: job ? 1 : 0, results: job ? [await processJob(job)] : [] };
    },
  };
}

function createAsyncVisionProcessor({ runProvider, enrich, persist } = {}) {
  if (typeof runProvider !== "function" || typeof enrich !== "function" || typeof persist !== "function") {
    throw new Error("VISION_ASYNC_PROCESSOR_DEPENDENCIES_MISSING");
  }
  return {
    async process(job) {
      if (!job || job.execution_owner !== "async" || ["completed", "failed", "timed_out", "cancelled"].includes(job.status)) {
        return { status: "noop", analysisId: job?.id || null };
      }
      const providerResult = job.resume_stage === "enriching" && job.provider_checkpoint
        ? job.provider_checkpoint
        : await runProvider({ ...job, providerAttempt: Number(job.provider_attempt || 1) + 1 });
      const enriched = await enrich(providerResult, job);
      return persist(job, enriched);
    },
  };
}

function createWiredVisionWorker({ claimJob, vision, resolveImageUrl, commitQuota, releaseQuota, completeJob, failJob, diagnostics } = {}) {
  if (typeof claimJob !== "function" || typeof vision?.analyzeImage !== "function" || typeof resolveImageUrl !== "function") {
    throw new Error("VISION_WIRED_WORKER_DEPENDENCIES_MISSING");
  }
  const processJob = async (job) => {
    if (!job || job.execution_owner !== "async" || ["completed", "failed", "timed_out", "cancelled"].includes(job.status)) {
      return { status: "noop", analysisId: job?.id || null };
    }
    const recordStage = createStageRecorder(diagnostics, job);
    let imageUrl;
    try {
      await recordStage("worker.asset_load", async () => {
        if (!job.image_path) throw Object.assign(new Error("image path missing"), { code: "VISION_ASSET_PATH_MISSING" });
      });
      imageUrl = await recordStage("worker.temp_url", async () => {
        const resolved = await resolveImageUrl(job.image_path);
        if (!resolved) throw Object.assign(new Error("image URL unavailable"), { code: "VISION_ANALYSIS_IMAGE_UNAVAILABLE" });
        return resolved;
      });
      const deadlineAt = job.deadline_at ? Date.parse(job.deadline_at) : null;
      const remainingMs = Number.isFinite(deadlineAt) ? deadlineAt - Date.now() : null;
      const deadlineStartedAt = new Date().toISOString();
      const deadlineStartedMs = Date.now();
      const decision = Number.isFinite(remainingMs) && remainingMs <= 0 ? "stop" : "continue";
      createWorkerDiagnosticEmitter(diagnostics)({
        stage: "worker.deadline_check",
        status: "started",
        startedAt: deadlineStartedAt,
        durationMs: 0,
        ...diagnosticIdentity(job),
      });
      createWorkerDiagnosticEmitter(diagnostics)({
        stage: "worker.deadline_check",
        status: "succeeded",
        startedAt: deadlineStartedAt,
        durationMs: Math.max(0, Date.now() - deadlineStartedMs),
        deadlineAt: job.deadline_at || null,
        remainingMs,
        decision,
        ...diagnosticIdentity(job),
      });
      if (decision === "stop") {
        throw Object.assign(new Error("async analysis deadline expired"), {
          code: "VISION_ASYNC_DEADLINE_EXPIRED",
          providerAttempt: Number(job.provider_attempt || 1),
        });
      }
      const workerRemainingMs = () => {
        const elapsedMs = Date.now() - deadlineStartedMs;
        return Number.isFinite(remainingMs) ? Math.max(0, remainingMs - elapsedMs) : ASYNC_PROVIDER_MAX_TIMEOUT_MS;
      };
      const asyncBudget = {
        providerTimeoutMs: Math.min(ASYNC_PROVIDER_MAX_TIMEOUT_MS, workerRemainingMs()),
        remainingMs: workerRemainingMs,
        remainingAfterReserve: (reserveMs = 0) => Math.max(0, workerRemainingMs() - Math.max(0, Number(reserveMs) || 0)),
        stageTimeout: (stageMaxMs, reserveMs = 0) => Math.min(
          Math.max(0, Number(stageMaxMs) || 0),
          Math.max(0, workerRemainingMs() - Math.max(0, Number(reserveMs) || 0)),
        ),
      };
      const checkpointResume = job.resume_stage === "enriching" && job.provider_checkpoint;
      const providerStartedAt = new Date().toISOString();
      const providerStartedMs = Date.now();
      const executionStage = checkpointResume ? "worker.checkpoint_resume" : "worker.provider_start";
      createWorkerDiagnosticEmitter(diagnostics)({
        stage: executionStage,
        status: "started",
        startedAt: providerStartedAt,
        durationMs: 0,
        providerAttempt: Number(job.provider_attempt || 1),
        ...diagnosticIdentity(job),
      });
      let result;
      try {
        result = await vision.analyzeImage(job.user_id, {
          analysisId: job.id,
          clientRequestId: job.client_request_id,
          contentType: job.content_type || "image/jpeg",
          storedImageUrl: imageUrl,
          imagePath: job.image_path,
          imageSha256: job.image_sha256,
          storedByteSize: job.byte_size,
          storedAsset: true,
          deferAnalysisPersistence: true,
          ...(checkpointResume
            ? { providerCheckpoint: job.provider_checkpoint }
            : {}),
          providerAttempt: checkpointResume
            ? Number(job.provider_attempt || 1)
            : Number(job.provider_attempt || 1) + 1,
        }, { budget: asyncBudget });
      } catch (error) {
        createWorkerDiagnosticEmitter(diagnostics)({
          stage: executionStage,
          status: "failed",
          startedAt: providerStartedAt,
          durationMs: Math.max(0, Date.now() - providerStartedMs),
          errorCode: safeErrorCode(error),
          providerAttempt: checkpointResume
            ? Number(job.provider_attempt || 1)
            : Number(job.provider_attempt || 1) + 1,
          ...diagnosticIdentity(job),
        });
        throw error;
      }
      const providerAttempt = checkpointResume
        ? Number(job.provider_attempt || 1)
        : Number(job.provider_attempt || 1) + 1;
      const completionResult = result && typeof result === "object" && !Array.isArray(result)
        ? { ...result, providerAttempt }
        : result;
      createWorkerDiagnosticEmitter(diagnostics)({
        stage: executionStage,
        status: "succeeded",
        startedAt: providerStartedAt,
        durationMs: Math.max(0, Date.now() - providerStartedMs),
        providerAttempt,
        ...diagnosticIdentity(job),
      });
      if (typeof completeJob === "function") {
        const completed = await completeJob(job, completionResult);
        if (completed?.accepted === false) throw new Error("VISION_ANALYSIS_COMPLETE_CAS_REJECTED");
      }
      if (typeof commitQuota === "function") await commitQuota(job.id, completionResult);
      return { status: "completed", analysisId: job.id, result: completionResult };
    } catch (error) {
      if (typeof failJob === "function") {
        await failJob(job, error).catch(() => {});
      }
      if (typeof releaseQuota === "function") await releaseQuota(job.id, error);
      throw error;
    }
  };
  return createWorker({ claimJob, processJob, diagnostics });
}

function createVisionWorkerRuntime({ foundation, vision, resolveImageUrl, diagnostics } = {}) {
  if (!foundation || typeof foundation.claimQueuedJob !== "function") {
    throw new Error("VISION_WORKER_FOUNDATION_MISSING");
  }
  const runtime = createWiredVisionWorker({
    claimJob: foundation.claimQueuedJob,
    vision,
    resolveImageUrl,
    commitQuota: foundation.commitQuota,
    releaseQuota: foundation.releaseQuota,
    diagnostics,
    completeJob: (job, response) => foundation.completeAsyncAnalysis({
      analysisId: job.id,
      expectedVersion: job.version,
      response,
    }),
    failJob: (job, error) => foundation.failAsyncAnalysis({
      analysisId: job.id,
      expectedVersion: job.version,
      status: ["VISION_TIMEOUT", "VISION_ASYNC_DEADLINE_EXPIRED"].includes(error?.code) ? "timed_out" : "failed",
      errorCode: error?.code,
    }),
  });
  runtime.loadClaimedJob = typeof foundation.loadClaimedJob === "function"
    ? (input) => foundation.loadClaimedJob(input)
    : null;
  return runtime;
}

function createProductionVisionWorker({ env = process.env, dependencies = {}, runtimeFactory, diagnostics } = {}) {
  let createRuntimeService = runtimeFactory;
  if (!createRuntimeService) {
    try {
      createRuntimeService = require("./get-login-ticket/index.js").createRuntimeService;
    } catch (error) {
      if (error?.code !== "MODULE_NOT_FOUND") throw error;
      createRuntimeService = require("../get-login-ticket/index.js").createRuntimeService;
    }
  }
  const service = createRuntimeService(env, dependencies);
  return createVisionWorkerRuntime({
    foundation: service.visionAnalysisFoundation,
    vision: service.vision,
    resolveImageUrl: service.resolveVisionImageUrl,
    diagnostics: diagnostics || createDefaultWorkerDiagnostics(),
  });
}

async function main({ enabled = process.env.VISION_ASYNC_FOUNDATION_ENABLED === "true", processOnce, job = null, analysisId = null, jobId = null, version = null, leaseUntil = null, env = process.env, dependencies = {}, runtimeFactory, diagnostics } = {}) {
  if (enabled !== true) {
    return { skipped: true, reason: "feature_disabled" };
  }
  if (typeof processOnce === "function") return processOnce();
  const { createDiagnosticRecorder } = require("./diagnostic-client.cjs");
  const recordDiagnostic = createDiagnosticRecorder({ env });
  await recordDiagnostic({
    stage: "worker.entry",
    status: "succeeded",
    runId: job?.run_id || job?.runId || null,
    analysisId: job?.id || null,
    jobId: job?.job_id || job?.jobId || null,
    version: job?.version ?? null,
    leaseUntil: job?.lease_until || job?.leaseUntil || null,
  });
  let runtime;
  try {
    runtime = createProductionVisionWorker({
      env,
      dependencies,
      runtimeFactory,
      diagnostics: diagnostics || createPersistentWorkerDiagnostics({ recordDiagnostic }),
    });
  } catch (error) {
    const errorCode = safeErrorCode(error);
    await recordDiagnostic({
      stage: "worker.runtime_init",
      status: "failed",
      errorCode,
      errorName: typeof error?.name === "string" ? error.name.slice(0, 80) : "Error",
    });
    return { failed: true, stage: "worker.runtime_init", errorCode };
  }
  const flatClaim = !job && analysisId && jobId && version != null
    ? { analysisId, jobId, version, leaseUntil }
    : null;
  if (flatClaim) {
    let claimedJob;
    try {
      claimedJob = await runtime.loadClaimedJob?.(flatClaim);
    } catch (error) {
      const errorCode = safeErrorCode(error);
      await recordDiagnostic({
        stage: "worker.claimed_job_load",
        status: "failed",
        errorCode,
      });
      return { failed: true, stage: "worker.claimed_job_load", errorCode };
    }
    if (!claimedJob) return { claimed: 0, results: [{ status: "noop", reason: "claimed_job_not_found" }] };
    return runtime.processClaimedJob(claimedJob);
  }
  if (job) {
    await recordDiagnostic({
      stage: "worker.claimed_job_validate",
      status: job.execution_owner === "async" && job.status && !["completed", "failed", "timed_out", "cancelled"].includes(job.status) ? "succeeded" : "failed",
      runId: job.run_id || job.runId || null,
      analysisId: job.id || null,
      jobId: job.job_id || job.jobId || null,
      version: job.version ?? null,
      leaseUntil: job.lease_until || job.leaseUntil || null,
      errorCode: job.execution_owner === "async" ? null : "VISION_ASYNC_JOB_INVALID",
    });
  }
  return job ? runtime.processClaimedJob(job) : runtime.processOnce();
}

exports.main = main;
exports.createWorker = createWorker;
exports.createAsyncVisionProcessor = createAsyncVisionProcessor;
exports.createWiredVisionWorker = createWiredVisionWorker;
exports.createVisionWorkerRuntime = createVisionWorkerRuntime;
exports.createProductionVisionWorker = createProductionVisionWorker;
exports.createDefaultWorkerDiagnostics = createDefaultWorkerDiagnostics;
