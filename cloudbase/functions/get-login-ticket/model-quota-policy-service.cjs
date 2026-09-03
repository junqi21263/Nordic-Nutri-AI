class ModelQuotaPolicyError extends Error {
  constructor(code, message = code, details = null) {
    super(message);
    this.name = "ModelQuotaPolicyError";
    this.code = code;
    this.details = details;
  }
}

const BALANCE_MODES = new Set(["unsupported", "manual", "automatic"]);
const WRITABLE_BALANCE_MODES = new Set(["unsupported", "manual"]);

function requiredKey(value, field, max = 255) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > max) throw new ModelQuotaPolicyError("MODEL_QUOTA_POLICY_INVALID", `${field} is invalid`);
  return normalized;
}

function optionalInteger(value, field, { min, max } = {}) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < min || number > max) {
    throw new ModelQuotaPolicyError("MODEL_QUOTA_POLICY_INVALID", `${field} is invalid`);
  }
  return number;
}

function optionalDecimal(value, field) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) throw new ModelQuotaPolicyError("MODEL_QUOTA_POLICY_INVALID", `${field} is invalid`);
  return number;
}

function optionalUnit(value) {
  if (value === null || value === undefined || value === "") return null;
  const unit = String(value).trim();
  if (!unit || unit.length > 32) throw new ModelQuotaPolicyError("MODEL_QUOTA_POLICY_INVALID", "providerBalanceUnit is invalid");
  return unit;
}

function normalizePolicy(row = null, identity = {}) {
  const providerKey = requiredKey(row?.provider_key ?? row?.providerKey ?? identity.providerKey, "providerKey", 64);
  const modelKey = requiredKey(row?.model_key ?? row?.modelKey ?? identity.modelKey, "modelKey");
  const featureKey = requiredKey(row?.feature_key ?? row?.featureKey ?? identity.featureKey, "featureKey", 64);
  const mode = String(row?.provider_balance_mode ?? row?.providerBalanceMode ?? "unsupported").trim();
  return {
    providerKey,
    modelKey,
    featureKey,
    dailyRequestLimit: optionalInteger(row?.daily_request_limit ?? row?.dailyRequestLimit, "dailyRequestLimit", { min: 1, max: 10000000 }),
    alertThresholdPercent: optionalInteger(row?.alert_threshold_percent ?? row?.alertThresholdPercent ?? 80, "alertThresholdPercent", { min: 1, max: 100 }) ?? 80,
    enabled: row?.enabled !== false,
    providerBalanceMode: BALANCE_MODES.has(mode) ? mode : "unsupported",
    providerBalanceManual: optionalDecimal(row?.provider_balance_manual ?? row?.providerBalanceManual, "providerBalanceManual"),
    providerBalanceUnit: optionalUnit(row?.provider_balance_unit ?? row?.providerBalanceUnit),
    updatedAt: row?.updated_at ?? row?.updatedAt ?? null,
  };
}

function policyIdentity(input = {}) {
  return {
    providerKey: requiredKey(input.providerKey, "providerKey", 64),
    modelKey: requiredKey(input.modelKey, "modelKey"),
    featureKey: requiredKey(input.featureKey, "featureKey", 64),
  };
}

function firstRow(data) {
  return Array.isArray(data) ? data[0] : data;
}

function createModelQuotaPolicyService({ db, adminAudit = null } = {}) {
  if (!db || typeof db.from !== "function") throw new Error("Model quota database client is required");

  async function resolve(input = {}) {
    const identity = policyIdentity(input);
    const result = await db.from("ai_model_quota_policies")
      .select("*")
      .eq("provider_key", identity.providerKey)
      .eq("model_key", identity.modelKey)
      .eq("feature_key", identity.featureKey)
      .maybeSingle();
    if (result?.error) throw new ModelQuotaPolicyError("MODEL_QUOTA_POLICY_READ_FAILED", "模型额度策略读取失败");
    return normalizePolicy(result?.data, identity);
  }

  async function listPolicies() {
    const result = await db.from("ai_model_quota_policies").select("*").order("updated_at", { ascending: false });
    if (result?.error) throw new ModelQuotaPolicyError("MODEL_QUOTA_POLICY_READ_FAILED", "模型额度策略读取失败");
    return (Array.isArray(result?.data) ? result.data : []).map((row) => normalizePolicy(row));
  }

  async function listPolicyUsage() {
    const policies = await listPolicies();
    if (typeof db.rpc !== "function") return policies.map((policy) => ({ ...policy, usage: null }));
    const result = await db.rpc("get_ai_model_quota_usage", {});
    if (result?.error) throw new ModelQuotaPolicyError("MODEL_QUOTA_USAGE_READ_FAILED", "模型额度用量读取失败");
    const usageByRoute = new Map((Array.isArray(result?.data) ? result.data : []).map((row) => [
      `${row.provider_key ?? row.providerKey}:${row.model_key ?? row.modelKey}:${row.feature_key ?? row.featureKey}`,
      row,
    ]));
    return policies.map((policy) => {
      const row = usageByRoute.get(`${policy.providerKey}:${policy.modelKey}:${policy.featureKey}`);
      const usedCount = Number(row?.used_count ?? row?.usedCount ?? 0);
      return {
        ...policy,
        usage: {
          usedCount,
          remaining: policy.dailyRequestLimit === null ? null : Math.max(policy.dailyRequestLimit - usedCount, 0),
          windowStartedAt: row?.window_started_at ?? row?.windowStartedAt ?? null,
        },
      };
    });
  }

  async function savePolicy(actorUserId, input = {}) {
    const identity = policyIdentity(input);
    const requestedBalanceMode = String(input.providerBalanceMode ?? "unsupported").trim();
    if (!WRITABLE_BALANCE_MODES.has(requestedBalanceMode)) {
      throw new ModelQuotaPolicyError("MODEL_QUOTA_POLICY_INVALID", "providerBalanceMode is invalid");
    }
    const normalized = normalizePolicy({ ...input, ...identity }, identity);
    normalized.providerBalanceMode = requestedBalanceMode;
    if (normalized.providerBalanceMode !== "manual") {
      normalized.providerBalanceManual = null;
      normalized.providerBalanceUnit = null;
    }
    const record = {
      provider_key: normalized.providerKey,
      model_key: normalized.modelKey,
      feature_key: normalized.featureKey,
      daily_request_limit: normalized.dailyRequestLimit,
      alert_threshold_percent: normalized.alertThresholdPercent,
      enabled: normalized.enabled,
      provider_balance_mode: normalized.providerBalanceMode,
      provider_balance_manual: normalized.providerBalanceManual,
      provider_balance_unit: normalized.providerBalanceUnit,
      updated_by: typeof actorUserId === "string" ? actorUserId.slice(0, 160) : null,
      updated_at: new Date().toISOString(),
    };
    const result = await db.from("ai_model_quota_policies")
      .upsert(record, { onConflict: "provider_key,model_key,feature_key" })
      .select("*")
      .maybeSingle();
    if (result?.error) throw new ModelQuotaPolicyError("MODEL_QUOTA_POLICY_SAVE_FAILED", "模型额度策略保存失败");
    const saved = normalizePolicy(result?.data ?? record, identity);
    if (typeof adminAudit?.record === "function") {
      await adminAudit.record({
        actorUserId,
        action: "ai_model_quota_policy.upsert",
        resourceType: "ai_model_quota_policy",
        resourceId: `${saved.providerKey}:${saved.modelKey}:${saved.featureKey}`,
        after: { dailyRequestLimit: saved.dailyRequestLimit, alertThresholdPercent: saved.alertThresholdPercent, enabled: saved.enabled, providerBalanceMode: saved.providerBalanceMode },
        result: "succeeded",
      });
    }
    return saved;
  }

  async function assertAllowed(input = {}) {
    const identity = policyIdentity(input);
    const policy = await resolve(identity);
    if (!policy.enabled) {
      throw new ModelQuotaPolicyError("MODEL_QUOTA_DISABLED", "该模型已被管理员停用", { policy });
    }
    if (policy.dailyRequestLimit === null) return { limited: false, policy, usage: null };
    if (typeof db.rpc !== "function") throw new ModelQuotaPolicyError("MODEL_QUOTA_UNAVAILABLE", "模型额度服务暂不可用");
    const result = await db.rpc("consume_ai_model_quota", {
      p_provider_key: policy.providerKey,
      p_model_key: policy.modelKey,
      p_feature_key: policy.featureKey,
      p_daily_limit: policy.dailyRequestLimit,
    });
    if (result?.error) throw new ModelQuotaPolicyError("MODEL_QUOTA_UNAVAILABLE", "模型额度服务暂不可用");
    const row = firstRow(result?.data);
    const usage = {
      usedCount: Number(row?.used_count ?? row?.usedCount ?? 0),
      remaining: Number(row?.remaining ?? 0),
      windowStartedAt: row?.window_started_at ?? row?.windowStartedAt ?? null,
    };
    if (!row?.allowed) {
      throw new ModelQuotaPolicyError("MODEL_QUOTA_EXCEEDED", "该模型今日调用额度已用尽", { policy, usage });
    }
    return { limited: true, policy, usage };
  }

  return { resolve, listPolicies, listPolicyUsage, savePolicy, assertAllowed };
}

module.exports = {
  ModelQuotaPolicyError,
  createModelQuotaPolicyService,
  normalizePolicy,
  policyIdentity,
};
