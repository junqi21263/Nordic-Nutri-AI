const { sanitizeAuditSnapshot } = require("./observability-sanitizer.cjs");

class AdminAuditError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "AdminAuditError";
    this.code = code;
  }
}

function boundedText(value, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : null;
}

function sanitizeAuditInput(input = {}) {
  return {
    actorUserId: boundedText(input.actorUserId, 160),
    action: boundedText(input.action, 120) || "unknown",
    resourceType: boundedText(input.resourceType, 80) || "unknown",
    resourceId: boundedText(input.resourceId, 200),
    before: sanitizeAuditSnapshot(input.before),
    after: sanitizeAuditSnapshot(input.after),
    result: ["succeeded", "failed", "rejected"].includes(input.result) ? input.result : "failed",
    errorCode: boundedText(input.errorCode, 80),
    traceId: boundedText(input.traceId, 160),
  };
}

async function withAdminAuditTransaction({ transaction, audit, mutation }) {
  if (typeof transaction !== "function") throw new AdminAuditError("ADMIN_AUDIT_TRANSACTION_UNAVAILABLE");
  if (typeof mutation !== "function") throw new AdminAuditError("ADMIN_AUDIT_MUTATION_INVALID");
  return transaction(async (tx) => {
    const result = await mutation(tx);
    await audit(result);
    return result;
  });
}

function createAdminAuditService({ db, observability } = {}) {
  async function record(input) {
    if (typeof observability?.recordAdminAudit !== "function") {
      throw new AdminAuditError("ADMIN_AUDIT_UNAVAILABLE");
    }
    try {
      return await observability.recordAdminAudit(sanitizeAuditInput(input));
    } catch (error) {
      throw new AdminAuditError("ADMIN_AUDIT_WRITE_FAILED", error?.message || "admin audit insert failed");
    }
  }

  async function runAtomicRpc(functionName, params = {}) {
    if (typeof db?.rpc !== "function") {
      throw new AdminAuditError("ADMIN_AUDIT_TRANSACTION_UNAVAILABLE");
    }
    const result = await db.rpc(functionName, params);
    if (result?.error) {
      const code = String(result.error.code || result.error.message || "");
      if (/FOOD_NOT_FOUND|AUDIT/i.test(code)) {
        throw new AdminAuditError(code.includes("FOOD_NOT_FOUND") ? "FOOD_NOT_FOUND" : "ADMIN_AUDIT_WRITE_FAILED", code);
      }
      throw new AdminAuditError("ADMIN_AUDIT_TRANSACTION_FAILED", code || "admin transaction failed");
    }
    return result?.data ?? result;
  }

  async function recordExternal(input, operationResult) {
    try {
      await record({ ...input, result: "succeeded" });
      return {
        ...(operationResult && typeof operationResult === "object" ? operationResult : { result: operationResult }),
        operationApplied: true,
        audit: { status: "recorded" },
      };
    } catch (error) {
      return {
        ...(operationResult && typeof operationResult === "object" ? operationResult : { result: operationResult }),
        operationApplied: true,
        audit: { status: "failed", errorCode: error.code || "ADMIN_AUDIT_WRITE_FAILED" },
      };
    }
  }

  return { record, runAtomicRpc, recordExternal };
}

module.exports = {
  AdminAuditError,
  createAdminAuditService,
  sanitizeAuditInput,
  withAdminAuditTransaction,
};

