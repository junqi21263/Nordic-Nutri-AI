class PublicOperationError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

function normalizeQuotaRecord(value) {
  return Array.isArray(value?.data) ? value.data[0] : value?.data;
}

function windowStartedAt(windowSeconds) {
  const seconds = Math.max(1, Number(windowSeconds) || 1);
  const epoch = Math.floor(Date.now() / 1000);
  return new Date(Math.floor(epoch / seconds) * seconds * 1000).toISOString();
}

function createOperationGuard({ db }) {
  if (!db || typeof db.from !== "function") throw new Error("Operation guard database is unavailable");

  async function callRpc(name, input) {
    if (typeof db.rpc !== "function") return null;
    const result = await db.rpc(name, input);
    if (result?.error) throw new Error(`Operation guard ${name} failed`);
    return normalizeQuotaRecord(result);
  }

  async function upsertRateLimitWindow(userId, operation, { limit, windowSeconds }) {
    const startedAt = windowStartedAt(windowSeconds);
    const existing = await db
      .from("rate_limit_windows")
      .select("request_count")
      .eq("user_id", userId)
      .eq("operation", operation)
      .eq("window_started_at", startedAt)
      .maybeSingle();
    if (existing?.error) throw new Error("Rate limit read failed");

    const current = Number(existing?.data?.request_count ?? 0);
    if (current >= limit) {
      return { allowed: false, usedCount: current };
    }

    if (existing?.data) {
      const updated = await db
        .from("rate_limit_windows")
        .update({ request_count: current + 1, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("operation", operation)
        .eq("window_started_at", startedAt)
        .select("request_count")
        .single();
      if (updated?.error) throw new Error("Rate limit update failed");
      return { allowed: true, usedCount: Number(updated.data?.request_count ?? current + 1) };
    }

    const inserted = await db
      .from("rate_limit_windows")
      .insert({
        user_id: userId,
        operation,
        window_started_at: startedAt,
        request_count: 1,
      })
      .select("request_count")
      .single();
    if (inserted?.error) throw new Error("Rate limit insert failed");
    return { allowed: true, usedCount: Number(inserted.data?.request_count ?? 1) };
  }

  async function readRateLimitUsage(userId, operation, windowSeconds) {
    const rpcRecord = await callRpc("get_rate_limit_window_usage", {
      p_user_id: userId,
      p_operation: operation,
      p_window_seconds: windowSeconds,
    }).catch(() => null);
    if (rpcRecord) return Number(rpcRecord.used_count ?? rpcRecord.usedCount ?? 0);

    const startedAt = windowStartedAt(windowSeconds);
    const existing = await db
      .from("rate_limit_windows")
      .select("request_count")
      .eq("user_id", userId)
      .eq("operation", operation)
      .eq("window_started_at", startedAt)
      .maybeSingle();
    if (existing?.error) throw new Error("Rate limit usage read failed");
    return Number(existing?.data?.request_count ?? 0);
  }

  async function consumeRateLimit(userId, operation, { limit, windowSeconds }) {
    const rpcRecord = await callRpc("consume_rate_limit_window", {
      p_user_id: userId,
      p_operation: operation,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    }).catch(() => null);
    if (rpcRecord) {
      return {
        allowed: Boolean(rpcRecord.allowed),
        usedCount: Number(rpcRecord.used_count ?? rpcRecord.usedCount ?? 0),
      };
    }
    return upsertRateLimitWindow(userId, operation, { limit, windowSeconds });
  }

  async function call(name, input) {
    const result = await db.rpc(name, input);
    if (result?.error) throw new Error(`Operation guard ${name} failed`);
    return Array.isArray(result?.data) ? result.data[0] : result?.data;
  }

  return {
    async claim(userId, operation, clientRequestId) {
      if (typeof db.rpc !== "function") throw new Error("Operation guard database RPC is unavailable");
      const record = await call("claim_operation_request", {
        p_user_id: userId,
        p_operation: operation,
        p_client_request_id: clientRequestId,
      });
      if (!record?.claimed) {
        if (record?.state === "succeeded") return { response: record.response, reused: true };
        throw new PublicOperationError("OPERATION_IN_PROGRESS", "请求正在处理中，请勿重复提交");
      }
      return { response: null, reused: false };
    },
    async fail(userId, operation, clientRequestId, errorCode) {
      if (typeof db.rpc !== "function") throw new Error("Operation guard database RPC is unavailable");
      await call("complete_operation_request", {
        p_user_id: userId,
        p_operation: operation,
        p_client_request_id: clientRequestId,
        p_state: "failed",
        p_error_code: errorCode,
      });
    },
    async consumeQuota(userId, operation, { limit, windowSeconds }) {
      const quotaLimit = Math.max(1, Number(limit) || 1);
      const window = Math.max(1, Number(windowSeconds) || 1);
      const record = await consumeRateLimit(userId, operation, { limit: quotaLimit, windowSeconds: window });
      if (!record.allowed) {
        throw new PublicOperationError("RATE_LIMITED", "请求过于频繁，请稍后再试");
      }
      return {
        used: record.usedCount,
        limit: quotaLimit,
        remaining: Math.max(0, quotaLimit - record.usedCount),
      };
    },
    async getQuotaUsage(userId, operation, { limit, windowSeconds }) {
      const quotaLimit = Math.max(1, Number(limit) || 1);
      const window = Math.max(1, Number(windowSeconds) || 1);
      const used = await readRateLimitUsage(userId, operation, window);
      return {
        used,
        limit: quotaLimit,
        remaining: Math.max(0, quotaLimit - used),
      };
    },
  };
}

module.exports = { PublicOperationError, createOperationGuard };
