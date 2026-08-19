const ANALYSIS_STATUSES = Object.freeze([
  "created",
  "uploaded",
  "analyzing",
  "enriching",
  "persisting",
  "completed",
  "failed",
  "timed_out",
  "cancelled",
]);

const TERMINAL_STATUSES = new Set(["completed", "failed", "timed_out", "cancelled"]);
const EXECUTION_OWNERS = Object.freeze(["fast", "async", "none"]);
const DISPATCH_STATES = Object.freeze(["none", "queued", "claimed", "running", "completed", "failed"]);

function mapAnalysisStatus(status) {
  return status === "succeeded" ? "completed" : String(status || "processing");
}

function isTerminalAnalysisStatus(status) {
  return TERMINAL_STATUSES.has(mapAnalysisStatus(status));
}

function computeReservationExpiry(deadlineAt, graceMs = 45_000) {
  const deadline = deadlineAt instanceof Date ? deadlineAt.getTime() : new Date(deadlineAt).getTime();
  if (!Number.isFinite(deadline)) throw new Error("VISION_ANALYSIS_DEADLINE_INVALID");
  return new Date(deadline + Math.max(0, Number(graceMs) || 0));
}

function rpcRow(result) {
  if (result?.error) throw result.error;
  return Array.isArray(result?.data) ? result.data[0] : result?.data;
}

function mapAnalysisRow(row) {
  if (!row) return null;
  const status = mapAnalysisStatus(row.status);
  const result = row.result
    ?? (status === "completed" && row.raw_recognition
      ? {
        ...row.raw_recognition,
        analysisId: row.id ?? row.analysis_id,
        items: row.normalized_items ?? row.raw_recognition.items ?? [],
        advice: row.advice ?? row.raw_recognition.advice ?? "",
        imagePath: row.image_path ?? null,
      }
      : row.provider_checkpoint ?? row.normalized_items ?? null);
  return {
    analysisId: row.id ?? row.analysis_id,
    status,
    currentStage: row.current_stage ?? null,
    errorCode: row.error_code ?? null,
    retryable: !isTerminalAnalysisStatus(status) || status === "failed" || status === "timed_out",
    deadlineAt: row.deadline_at ?? null,
    expiresAt: row.expires_at ?? null,
    executionOwner: row.execution_owner ?? "none",
    dispatchState: row.dispatch_state ?? "none",
    version: Number(row.version ?? 0),
    jobId: row.job_id ?? null,
    providerAttempt: Number(row.provider_attempt ?? 0),
    resumeStage: row.resume_stage ?? null,
    ...(status === "completed" ? { result } : {}),
  };
}

function createVisionAnalysisService({ db, featureEnabled = false } = {}) {
  if (!db || typeof db.from !== "function" && typeof db.rpc !== "function") throw new Error("VISION_ANALYSIS_DB_UNAVAILABLE");

  return {
    featureEnabled: featureEnabled === true,

    async createVisionAnalysis(input = {}) {
      if (typeof db.rpc !== "function") throw new Error("VISION_ANALYSIS_RPC_UNAVAILABLE");
      const analysisId = input.analysisId || crypto.randomUUID();
      const result = await db.rpc("create_vision_analysis", {
        p_analysis_id: analysisId,
        p_user_id: input.userId,
        p_client_request_id: input.clientRequestId,
        p_provider: input.provider || "qwen",
        p_model: input.model || "qwen3-vl-flash",
        p_deadline_at: input.deadlineAt,
        p_reservation_expires_at: input.reservationExpiresAt || computeReservationExpiry(input.deadlineAt || new Date(Date.now() + 12_500)),
        p_image_path: input.imagePath ?? null,
        p_image_sha256: input.imageSha256 ?? null,
      });
      const row = rpcRow(result);
      if (!row) throw new Error("VISION_ANALYSIS_CREATE_EMPTY");
      return {
        analysisId: row.analysis_id ?? row.id,
        status: mapAnalysisStatus(row.status),
        quotaState: row.quota_state ?? "reserved",
        reused: row.reused === true,
        reservationId: row.reservation_id ?? null,
        version: Number(row.version ?? 0),
        deadlineAt: row.deadline_at ?? input.deadlineAt ?? null,
        expiresAt: row.expires_at ?? input.reservationExpiresAt ?? null,
      };
    },

    async getOwnedAnalysis(userId, analysisId) {
      if (!userId || !analysisId) return null;
      let query = db.from("ai_analysis")
        .select("id,status,current_stage,error_code,deadline_at,expires_at,execution_owner,dispatch_state,job_id,provider_attempt,resume_stage,raw_recognition,normalized_items,provider_checkpoint,advice,image_path,version")
        .eq("id", analysisId)
        .eq("user_id", userId);
      const result = await (typeof query?.maybeSingle === "function" ? query.maybeSingle() : query);
      if (result?.error) throw result.error;
      return mapAnalysisRow(Array.isArray(result?.data) ? result.data[0] : result?.data);
    },

    async markAssetReady(input = {}) {
      if (!input.analysisId || typeof db.from !== "function") throw new Error("VISION_ANALYSIS_ASSET_CONTEXT_MISSING");
      const asset = await db.from("uploaded_assets").insert({
        user_id: input.userId,
        analysis_id: input.analysisId,
        bucket_id: "cloudbase-storage",
        object_path: input.cloudPath,
        content_type: input.contentType,
        byte_size: input.byteSize,
        sha256: input.imageSha256,
        status: "attached",
      }).select("id").single();
      if (asset?.error) throw asset.error;
      const assetId = asset?.data?.id;
      if (!assetId) throw new Error("VISION_ANALYSIS_ASSET_ID_MISSING");
      const updated = await this.updateAnalysis(input.analysisId, {
        status: "uploaded",
        current_stage: "uploaded",
        image_path: input.cloudPath,
        image_sha256: input.imageSha256,
      }, "fast", input.expectedVersion);
      return { assetId, ...updated };
    },

    async checkpointProvider(input = {}) {
      if (!input.analysisId) throw new Error("VISION_ANALYSIS_CHECKPOINT_CONTEXT_MISSING");
      if (input.expectedVersion != null && typeof db.rpc === "function") {
        const result = await db.rpc("checkpoint_vision_analysis", {
          p_analysis_id: input.analysisId,
          p_expected_version: Number(input.expectedVersion),
          p_provider_checkpoint: input.providerResult ?? null,
          p_provider_attempt: Number(input.providerAttempt || 1),
        });
        const row = rpcRow(result);
        return row ? { accepted: row.accepted === true, analysisId: row.analysis_id ?? row.id, version: Number(row.version ?? 0) } : { accepted: false };
      }
      return this.updateAnalysis(input.analysisId, {
        status: "enriching",
        current_stage: "enriching",
        resume_stage: "enriching",
        provider_checkpoint: input.providerResult ?? null,
        provider_completed_at: new Date().toISOString(),
        provider_attempt: Number(input.providerAttempt || 1),
      }, "fast", input.expectedVersion);
    },

    async queueAsyncAnalysis(input = {}) {
      if (!input.analysisId) throw new Error("VISION_ANALYSIS_HANDOFF_CONTEXT_MISSING");
      const resumeStage = input.resumeStage === "enriching" ? "enriching" : "analyzing";
      if (input.expectedVersion != null && typeof db.rpc === "function") {
        const result = await db.rpc("queue_vision_analysis", {
          p_analysis_id: input.analysisId,
          p_expected_version: Number(input.expectedVersion),
          p_resume_stage: resumeStage,
          p_trigger_reason: input.triggerReason || "dispatch_recovery",
          p_provider_attempt: Number(input.providerAttempt || 1),
        });
        const row = rpcRow(result);
        return row ? { accepted: row.accepted === true, analysisId: row.analysis_id ?? row.id, version: Number(row.version ?? 0) } : { accepted: false };
      }
      return this.updateAnalysis(input.analysisId, {
        status: resumeStage,
        current_stage: resumeStage,
        execution_owner: "async",
        dispatch_state: "queued",
        resume_stage: resumeStage,
        async_trigger_reason: input.triggerReason || "dispatch_recovery",
        provider_attempt: Number(input.providerAttempt || 1),
      }, "fast", input.expectedVersion);
    },

    async completeAsyncAnalysis(input = {}) {
      if (!input.analysisId || typeof db.rpc !== "function") throw new Error("VISION_ANALYSIS_COMPLETE_CONTEXT_MISSING");
      const result = await db.rpc("complete_vision_analysis", {
        p_analysis_id: input.analysisId,
        p_expected_version: Number(input.expectedVersion),
        p_response: input.response ?? null,
      });
      const row = rpcRow(result);
      return row ? { accepted: row.accepted === true, analysisId: row.analysis_id ?? row.id, version: Number(row.version ?? 0) } : { accepted: false };
    },

    async failAsyncAnalysis(input = {}) {
      if (!input.analysisId || typeof db.rpc !== "function") throw new Error("VISION_ANALYSIS_FAILURE_CONTEXT_MISSING");
      const status = ["failed", "timed_out", "cancelled"].includes(input.status) ? input.status : "failed";
      const result = await db.rpc("fail_vision_analysis", {
        p_analysis_id: input.analysisId,
        p_expected_version: Number(input.expectedVersion),
        p_status: status,
        p_error_code: input.errorCode || "VISION_ANALYSIS_FAILED",
      });
      const row = rpcRow(result);
      return row ? { accepted: row.accepted === true, analysisId: row.analysis_id ?? row.id, version: Number(row.version ?? 0) } : { accepted: false };
    },

    async updateAnalysis(analysisId, patch, expectedOwner = "fast", expectedVersion = null) {
      if (typeof db.from !== "function") throw new Error("VISION_ANALYSIS_DB_UNAVAILABLE");
      const versionedPatch = expectedVersion != null
        ? { ...patch, version: Number(expectedVersion) + 1 }
        : patch;
      let query = db.from("ai_analysis")
        .update({ ...versionedPatch, updated_at: new Date().toISOString() })
        .eq("id", analysisId)
        .eq("execution_owner", expectedOwner);
      if (expectedVersion != null) query = query.eq("version", Number(expectedVersion));
      const result = await (typeof query.select === "function" ? query.select("id").maybeSingle() : query);
      if (result?.error) throw result.error;
      const row = Array.isArray(result?.data) ? result.data[0] : result?.data;
      if (!row?.id) return { accepted: false };
      return { accepted: true, analysisId: row.id, ...(expectedVersion != null ? { version: Number(expectedVersion) + 1 } : {}) };
    },

    async claimQueuedJob(input = {}) {
      if (typeof db.rpc !== "function") throw new Error("VISION_ANALYSIS_RPC_UNAVAILABLE");
      const result = await db.rpc("claim_vision_analysis_job", {
        p_limit: input.limit ?? 1,
        p_lease_seconds: input.leaseSeconds ?? 60,
      });
      return result?.data ?? [];
    },

    async loadClaimedJob(input = {}) {
      if (!input.analysisId || !input.jobId || input.version == null || typeof db.from !== "function") {
        throw new Error("VISION_ANALYSIS_CLAIMED_JOB_CONTEXT_MISSING");
      }
      const query = db.from("ai_analysis")
        .select("id,user_id,client_request_id,status,current_stage,error_code,deadline_at,expires_at,execution_owner,dispatch_state,job_id,lease_until,provider_attempt,resume_stage,provider_checkpoint,raw_recognition,normalized_items,advice,image_path,image_sha256,provider_completed_at,version")
        .eq("id", input.analysisId)
        .eq("job_id", input.jobId)
        .eq("version", Number(input.version))
        .eq("execution_owner", "async")
        .eq("dispatch_state", "running")
        .gt("lease_until", new Date().toISOString());
      const result = await (typeof query.maybeSingle === "function" ? query.maybeSingle() : query);
      if (result?.error) throw result.error;
      return Array.isArray(result?.data) ? result.data[0] ?? null : result?.data ?? null;
    },

    async reclaimExpiredJobs(input = {}) {
      if (typeof db.rpc !== "function") throw new Error("VISION_ANALYSIS_RPC_UNAVAILABLE");
      const result = await db.rpc("reclaim_vision_analysis_jobs", { p_limit: input.limit ?? 100 });
      return result?.data ?? [];
    },

    async commitQuota(analysisId, response = null) {
      if (typeof db.rpc !== "function") throw new Error("VISION_ANALYSIS_RPC_UNAVAILABLE");
      const result = await db.rpc("commit_vision_analysis_quota", { p_analysis_id: analysisId, p_response: response });
      if (result?.error) throw result.error;
      return result?.data;
    },

    async releaseQuota(analysisId) {
      if (typeof db.rpc !== "function") throw new Error("VISION_ANALYSIS_RPC_UNAVAILABLE");
      const result = await db.rpc("release_vision_analysis_quota", { p_analysis_id: analysisId });
      if (result?.error) throw result.error;
      return result?.data;
    },
  };
}

module.exports = {
  ANALYSIS_STATUSES,
  TERMINAL_STATUSES,
  EXECUTION_OWNERS,
  DISPATCH_STATES,
  mapAnalysisStatus,
  isTerminalAnalysisStatus,
  computeReservationExpiry,
  mapAnalysisRow,
  createVisionAnalysisService,
};
const crypto = require("node:crypto");
