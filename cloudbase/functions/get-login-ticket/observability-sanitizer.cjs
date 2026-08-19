const MAX_STRING_LENGTH = 200;

const TRACE_META_KEYS = new Set([
  "feature",
  "provider",
  "model",
  "fallbackUsed",
  "errorCode",
  "httpStatus",
  "userHash",
  "clientRequestId",
  "source",
  "providerRequestIdHash",
  "route",
  "method",
  "clientVersion",
  "environment",
  "functionVersion",
  "artifactSha",
  "requestSchemaSummary",
  "imageMimeType",
  "imageBytes",
  "originalContentType",
  "finalContentType",
  "originalBytes",
  "finalBytes",
  "originalWidth",
  "originalHeight",
  "finalWidth",
  "finalHeight",
  "orientation",
  "imagePrepareDurationMs",
  "imageReadDurationMs",
  "objectSize",
  "tempUrlGenerationMs",
  "requestTotalDurationMs",
  "remainingBudgetMs",
  "timeoutBudgetMs",
  "providerRequestDurationMs",
  "providerErrorCode",
  "providerErrorType",
  "providerAttempt",
  "imageSha256",
  "stage",
  "stageDurationMs",
  "lastSuccessfulStage",
  "providerHttpStatus",
  "sqlstate",
  "rpcName",
  "constraint",
  "quotaReservationId",
  "quotaState",
  "quotaDelta",
  "analysisId",
  "jobId",
  "runId",
  "version",
  "leaseUntil",
  "remainingMs",
  "status",
  "errorCode",
  "retryCount",
  "sanitizationVersion",
  "businessCode",
  "fastPathOutcome",
  "asyncTriggerReason",
]);

const AUDIT_SNAPSHOT_KEYS = new Set([
  "id",
  "name",
  "status",
  "reasonCode",
  "isPrimary",
  "isActive",
  "enabled",
  "count",
  "outcome",
  "result",
  "errorCode",
  "feature",
  "jobKey",
  "schedule",
  "runtimeBindingStatus",
  "provider",
  "durationMs",
  "note",
]);

function boundedString(value) {
  if (typeof value !== "string") return null;
  return value.trim().slice(0, MAX_STRING_LENGTH);
}

function copyScalar(value) {
  if (typeof value === "boolean" || typeof value === "number") return value;
  return boundedString(value);
}

function sanitizeByKeys(input, keys) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const output = {};
  for (const key of keys) {
    if (!(key in input)) continue;
    const value = copyScalar(input[key]);
    if (value !== null) output[key] = value;
  }
  return output;
}

function sanitizeTraceStage(stage) {
  const result = sanitizeByKeys(stage, [
    "name",
    "startedAt",
    "durationMs",
    "status",
    "provider",
    "providerRequestIdHash",
    "timeoutBudgetMs",
    "providerHttpStatus",
    "providerErrorCode",
    "providerErrorType",
    "providerRequestDurationMs",
    "objectSize",
  ]);
  if (typeof result.name !== "string" || !result.name) return {};
  return result;
}

function sanitizeTraceMeta(meta) {
  return sanitizeByKeys(meta, TRACE_META_KEYS);
}

function sanitizeAuditSnapshot(snapshot) {
  return sanitizeByKeys(snapshot, AUDIT_SNAPSHOT_KEYS);
}

module.exports = {
  MAX_STRING_LENGTH,
  sanitizeTraceStage,
  sanitizeTraceMeta,
  sanitizeAuditSnapshot,
};
