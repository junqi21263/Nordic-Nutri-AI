const MAX_STRING_LENGTH = 200;

const AUDIT_SNAPSHOT_KEYS = new Set([
  "id", "name", "status", "reasonCode", "isPrimary", "isActive", "enabled",
  "count", "outcome", "result", "errorCode", "feature", "jobKey", "schedule",
  "runtimeBindingStatus", "provider", "durationMs", "note",
]);

function boundedString(value) {
  return typeof value === "string" ? value.trim().slice(0, MAX_STRING_LENGTH) : null;
}

function copyScalar(value) {
  if (typeof value === "boolean" || typeof value === "number") return value;
  return boundedString(value);
}

function sanitizeAuditSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return {};
  const output = {};
  for (const key of AUDIT_SNAPSHOT_KEYS) {
    if (!(key in snapshot)) continue;
    const value = copyScalar(snapshot[key]);
    if (value !== null) output[key] = value;
  }
  return output;
}

module.exports = { MAX_STRING_LENGTH, sanitizeAuditSnapshot };
