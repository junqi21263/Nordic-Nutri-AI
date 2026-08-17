const JOB_CATALOG = Object.freeze([
  {
    key: "food_image_worker",
    label: "Food Image Worker",
    schedule: "every 10 minutes",
    configured: true,
    runtimeBindingStatus: "unknown",
    manualAllowed: true,
  },
  {
    key: "vision_cleanup",
    label: "Vision Cleanup",
    schedule: "daily",
    configured: true,
    runtimeBindingStatus: "unknown",
    manualAllowed: true,
  },
  {
    key: "food_image_patrol",
    label: "Food Image Patrol",
    schedule: "daily",
    configured: true,
    runtimeBindingStatus: "unknown",
    manualAllowed: true,
  },
  {
    key: "achievement_evaluation",
    label: "Achievement Evaluation",
    schedule: "daily",
    configured: false,
    runtimeBindingStatus: "unavailable",
    manualAllowed: false,
  },
  {
    key: "quota_reset",
    label: "Quota Reset",
    schedule: "daily",
    configured: false,
    runtimeBindingStatus: "unavailable",
    manualAllowed: false,
  },
]);

class JobOpsError extends Error {
  constructor(code, message = code) {
    super(message);
    this.code = code;
  }
}

function findJob(jobKey) {
  return JOB_CATALOG.find((job) => job.key === jobKey) || null;
}

function createJobOpsService({
  observability,
  adminAudit,
  foodImageBatches,
  foodImagePatrol,
  visionImageRetention,
} = {}) {
  async function listJobs() {
    const result = [];
    for (const job of JOB_CATALOG) {
      let lastRun = null;
      if (typeof observability?.listJobRuns === "function") {
        try {
          lastRun = await observability.listJobRuns({ jobKey: job.key, limit: 1 }).then((value) => value.items?.[0] || null);
        } catch (error) {
          console.warn("[job-ops] job run lookup failed:", job.key, error?.message || error);
        }
      }
      result.push({ ...job, lastRun });
    }
    return { items: result };
  }

  async function execute(job, options = {}) {
    if (job.key === "food_image_worker") {
      if (typeof foodImageBatches?.dispatchTrusted !== "function") throw new JobOpsError("JOB_UNAVAILABLE");
      return foodImageBatches.dispatchTrusted({ maxItems: options.maxItems });
    }
    if (job.key === "vision_cleanup") {
      if (typeof visionImageRetention?.purgeExpiredVisionImages !== "function") throw new JobOpsError("JOB_UNAVAILABLE");
      return visionImageRetention.purgeExpiredVisionImages({ limit: options.limit });
    }
    if (job.key === "food_image_patrol") {
      if (typeof foodImagePatrol?.runTrusted !== "function") throw new JobOpsError("JOB_UNAVAILABLE");
      return foodImagePatrol.runTrusted({ force: true });
    }
    throw new JobOpsError("JOB_NOT_ALLOWED");
  }

  async function runNow(jobKey, { actorUserId, traceId, maxItems, limit } = {}) {
    const job = findJob(jobKey);
    if (!job || !job.manualAllowed) throw new JobOpsError("JOB_NOT_ALLOWED");

    // Audit authorization is deliberately before the trusted executor. If it
    // cannot be recorded, no external work is started.
    if (typeof adminAudit?.record !== "function") throw new JobOpsError("ADMIN_AUDIT_UNAVAILABLE");
    await adminAudit.record({
      actorUserId,
      action: "job.run",
      resourceType: "job",
      resourceId: job.key,
      result: "succeeded",
      traceId,
      after: { jobKey: job.key, trigger: "manual", runtimeBindingStatus: job.runtimeBindingStatus },
    });

    const startedAt = new Date().toISOString();
    try {
      await observability?.recordJobRun?.({
        jobKey: job.key,
        configured: job.configured,
        runtimeBindingStatus: job.runtimeBindingStatus,
        trigger: "manual",
        status: "running",
        startedAt,
        traceId,
      });
    } catch (startRecordError) {
      console.warn("[job-ops] start run record unavailable:", job.key, startRecordError?.message || startRecordError);
    }

    let status = "succeeded";
    let result;
    let errorCode = null;
    let errorSummary = null;
    try {
      result = await execute(job, { maxItems, limit });
      return { job, result, status };
    } catch (error) {
      status = error.code === "JOB_CANCELLED" ? "cancelled" : "failed";
      errorCode = error.code || "JOB_RUN_FAILED";
      errorSummary = String(error.message || error).slice(0, 200);
      try {
        await adminAudit.record({
          actorUserId,
          action: "job.run",
          resourceType: "job",
          resourceId: job.key,
          result: "failed",
          errorCode,
          traceId,
          after: { jobKey: job.key, trigger: "manual", status, operationApplied: true },
        });
      } catch (auditError) {
        console.warn("[job-ops] failed run audit unavailable:", job.key, auditError?.message || auditError);
      }
      throw error;
    } finally {
      // A failed finish record is intentionally not retried by executing the
      // business job again. The worker result above remains the source of truth.
      try {
        await observability?.recordJobRun?.({
          jobKey: job.key,
          configured: job.configured,
          runtimeBindingStatus: job.runtimeBindingStatus,
          trigger: "manual",
          status,
          startedAt,
          completedAt: new Date().toISOString(),
          processedCount: Number.isInteger(result?.processed) ? result.processed : null,
          errorCode,
          errorSummary,
          traceId,
        });
      } catch (finishError) {
        console.warn("[job-ops] finish run record unavailable:", job.key, finishError?.message || finishError);
      }
    }
  }

  return { listJobs, runNow };
}

module.exports = { JOB_CATALOG, JobOpsError, createJobOpsService, findJob };

