const VERIFICATION_TYPES = new Set(["email", "phone"]);
const VERIFICATION_PURPOSES = new Set(["register", "reset_password"]);
const VERIFICATION_STATUSES = new Set(["created", "sent", "failed", "used", "expired", "invalidated"]);

class VerificationCenterError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = "VerificationCenterError";
    this.code = code;
  }
}

function boundedText(value, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : null;
}

function maskTarget(value, type) {
  const target = boundedText(value, 320) || "—";
  if (type === "email") {
    const [local, domain] = target.split("@");
    if (!domain) return "***";
    return `${(local || "").slice(0, 1)}***@${domain}`;
  }
  if (type === "phone") return target.length > 6 ? `${target.slice(0, 3)}******${target.slice(-2)}` : "***";
  return "***";
}

function mapVerification(row, { debugOtpCode } = {}) {
  const active = ["created", "sent"].includes(row.status) && !row.used_at;
  return {
    id: boundedText(row.id, 160),
    channel: row.target_type,
    purpose: row.purpose,
    target: maskTarget(row.target_value, row.target_type),
    createdAt: row.created_at || null,
    sentAt: row.sent_at || null,
    expiresAt: row.expires_at || null,
    usedAt: row.used_at || null,
    status: VERIFICATION_STATUSES.has(row.status) ? row.status : "created",
    sendAttempts: Number(row.send_attempt_count || 0),
    verifyAttempts: Number(row.attempt_count || 0),
    provider: boundedText(row.provider, 80),
    providerMessageId: boundedText(row.provider_message_id, 200),
    providerDeliveryStatus: boundedText(row.provider_delivery_status, 120),
    providerHttpStatus: Number.isFinite(Number(row.provider_http_status)) ? Number(row.provider_http_status) : null,
    providerErrorCode: boundedText(row.provider_error_code, 120),
    providerErrorReason: boundedText(row.provider_error_reason, 240),
    userId: boundedText(row.user_id, 160),
    traceId: boundedText(row.trace_id, 160),
    captchaStatus: boundedText(row.captcha_status, 40),
    rateLimitStatus: boundedText(row.rate_limit_status, 40),
    ...(debugOtpCode && active ? { debugCode: debugOtpCode } : {}),
  };
}

function createVerificationCenterService({ db, isAdmin, auth, audit, debugOtpCode = null } = {}) {
  if (!db?.from || typeof isAdmin !== "function") throw new Error("Verification center deps missing");

  async function requireAdmin(userId) {
    if (!userId) throw new VerificationCenterError("UNAUTHORIZED");
    if (!(await isAdmin(userId))) throw new VerificationCenterError("FORBIDDEN");
  }

  async function list(userId, { targetType, purpose, status, userId: linkedUserId, limit = 50 } = {}) {
    await requireAdmin(userId);
    const cap = Math.min(Math.max(Number(limit) || 50, 1), 200);
    let query = db.from("auth_verification_codes")
      .select("id,target,target_value,target_type,purpose,status,created_at,sent_at,expires_at,used_at,attempt_count,send_attempt_count,provider,provider_message_id,provider_delivery_status,provider_http_status,provider_error_code,provider_error_reason,user_id,trace_id,captcha_status,rate_limit_status", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(0, cap - 1);
    if (VERIFICATION_TYPES.has(targetType)) query = query.eq("target_type", targetType);
    if (VERIFICATION_PURPOSES.has(purpose)) query = query.eq("purpose", purpose);
    if (VERIFICATION_STATUSES.has(status)) query = query.eq("status", status);
    if (linkedUserId) query = query.eq("user_id", boundedText(linkedUserId, 160));
    const result = await query;
    if (result?.error) throw new VerificationCenterError("VERIFICATION_LIST_FAILED");
    return { items: (result.data || []).map((row) => mapVerification(row, { debugOtpCode })), nextCursor: null, total: Number(result.count || result.data?.length || 0) };
  }

  async function get(userId, verificationId) {
    await requireAdmin(userId);
    const safeId = boundedText(verificationId, 160);
    if (!safeId) throw new VerificationCenterError("VERIFICATION_NOT_FOUND");
    const result = await db.from("auth_verification_codes")
      .select("id,target,target_value,target_type,purpose,status,created_at,sent_at,expires_at,used_at,attempt_count,send_attempt_count,provider,provider_message_id,provider_delivery_status,provider_http_status,provider_error_code,provider_error_reason,user_id,trace_id,captcha_status,rate_limit_status")
      .eq("id", safeId)
      .maybeSingle();
    if (result?.error) throw new VerificationCenterError("VERIFICATION_READ_FAILED");
    if (!result.data) throw new VerificationCenterError("VERIFICATION_NOT_FOUND");
    return mapVerification(result.data, { debugOtpCode });
  }

  async function resend(userId, verificationId, { traceId } = {}) {
    await requireAdmin(userId);
    if (typeof auth?.resendVerificationCode !== "function") throw new VerificationCenterError("AUTH_NOT_CONFIGURED");
    let result;
    try {
      result = await auth.resendVerificationCode({ verificationId, traceId });
    } catch (error) {
      if (typeof audit?.record === "function") {
        await audit.record({
          actorUserId: userId,
          action: "verification_code_resend",
          resourceType: "auth_verification_code",
          resourceId: verificationId,
          result: "failed",
          errorCode: boundedText(error?.code, 80) || "AUTH_PROVIDER_UNAVAILABLE",
          after: { oldVerificationId: verificationId, status: "failed", errorCode: boundedText(error?.code, 80) || "AUTH_PROVIDER_UNAVAILABLE" },
          traceId,
        }).catch(() => {});
      }
      throw error;
    }
    if (typeof audit?.recordExternal === "function") {
      return audit.recordExternal({
        actorUserId: userId,
        action: "verification_code_resend",
        resourceType: "auth_verification_code",
        resourceId: verificationId,
        after: { verificationId: result.verificationId, oldVerificationId: verificationId, targetType: result.targetType, purpose: result.purpose, status: "sent" },
        traceId,
      }, result);
    }
    return result;
  }

  return { list, get, resend, mapVerification, maskTarget };
}

module.exports = { VerificationCenterError, createVerificationCenterService, mapVerification, maskTarget };
