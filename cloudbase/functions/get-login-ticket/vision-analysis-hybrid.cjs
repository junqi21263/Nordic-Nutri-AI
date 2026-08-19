const TRANSIENT_PROVIDER_CODES = new Set(["VISION_TIMEOUT", "VISION_RETRYABLE"]);

function shouldUseHybrid({ featureEnabled = false, supportsAsyncVision = false } = {}) {
  return featureEnabled === true && supportsAsyncVision === true;
}

function classifyAsyncTrigger(error = {}) {
  if (error.code === "VISION_TIMEOUT") return "fast_timeout";
  if (error.code === "VISION_RETRYABLE" && Number(error.providerHttpStatus) >= 500) return "provider_5xx";
  if (error.code === "VISION_RETRYABLE" && error.providerErrorType === "network") return "transient_network";
  if (TRANSIENT_PROVIDER_CODES.has(error.code) && error.providerErrorType === "transient") return "transient_network";
  return null;
}

function processingResponse(analysis, currentStage = "analyzing") {
  return {
    httpStatus: 202,
    body: {
      status: "processing",
      analysisId: analysis.analysisId,
      currentStage: analysis.currentStage || currentStage,
      pollAfterMs: 1500,
      ...(analysis.deadlineAt ? { deadlineAt: analysis.deadlineAt } : {}),
    },
  };
}

function completedResponse(analysis) {
  return {
    httpStatus: 200,
    body: {
      status: "completed",
      analysisId: analysis.analysisId,
      result: analysis.result,
    },
  };
}

function terminalResponse(analysis) {
  return {
    httpStatus: 200,
    body: {
      status: analysis.status,
      analysisId: analysis.analysisId,
      errorCode: analysis.errorCode || "VISION_ANALYSIS_FAILED",
      retryable: analysis.retryable === true,
      ...(analysis.message ? { message: analysis.message } : {}),
    },
  };
}

function reusedResponse(analysis) {
  if (analysis.status === "completed") return completedResponse(analysis);
  if (["failed", "timed_out", "cancelled"].includes(analysis.status)) return terminalResponse(analysis);
  return processingResponse(analysis, analysis.resumeStage === "enriching" ? "enriching" : "analyzing");
}

function createHybridVisionController({ featureEnabled = false, createAnalysis, runLegacy, runFast, handoff } = {}) {
  if (typeof createAnalysis !== "function") throw new Error("VISION_HYBRID_CREATE_ANALYSIS_MISSING");
  if (typeof runFast !== "function") throw new Error("VISION_HYBRID_FAST_PATH_MISSING");
  return {
    async post(input = {}) {
      const hybrid = shouldUseHybrid({
        featureEnabled,
        supportsAsyncVision: input.supportsAsyncVision === true,
      });
      if (!hybrid) {
        if (typeof runLegacy !== "function") return runFast(input);
        return runLegacy(input);
      }

      const analysis = await createAnalysis(input);
      if (!analysis?.analysisId) throw new Error("VISION_HYBRID_ANALYSIS_ID_MISSING");
      if (analysis.reused === true || ["completed", "analyzing", "enriching", "persisting", "failed", "timed_out", "cancelled"].includes(analysis.status)) {
        return reusedResponse(analysis);
      }

      let handoffAttempted = false;
      try {
        const result = await runFast({ ...input, analysisId: analysis.analysisId, analysis });
        if (result?.kind === "checkpoint") {
          handoffAttempted = true;
          const accepted = await handoff?.({
            analysisId: analysis.analysisId,
            providerResult: result.providerResult,
            providerAttempt: Number(result.providerAttempt || 1),
            resumeStage: "enriching",
            triggerReason: "provider_success_budget_exhausted",
          });
          if (!accepted?.accepted) {
            const error = Object.assign(new Error("VISION_ASYNC_HANDOFF_FAILED"), { code: "VISION_TIMEOUT", handoffAccepted: false });
            throw error;
          }
          return processingResponse(analysis, "enriching");
        }
        return completedResponse({ analysisId: analysis.analysisId, result });
      } catch (error) {
        const triggerReason = classifyAsyncTrigger(error);
        if (!triggerReason || handoffAttempted || typeof handoff !== "function") throw error;
        handoffAttempted = true;
        const resumeStage = error?.resumeStage === "enriching" ? "enriching" : "analyzing";
        const accepted = await handoff({
          analysisId: analysis.analysisId,
          providerAttempt: Number(error?.providerAttempt || 1),
          resumeStage,
          triggerReason: resumeStage === "enriching" ? "provider_success_budget_exhausted" : triggerReason,
        });
        if (!accepted?.accepted) {
          error.handoffAccepted = false;
          throw error;
        }
        return processingResponse(analysis, resumeStage);
      }
    },
  };
}

module.exports = {
  createHybridVisionController,
  classifyAsyncTrigger,
  shouldUseHybrid,
};
