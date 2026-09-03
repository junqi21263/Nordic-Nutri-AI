class FeatureUserQuotaPolicyError extends Error {
  constructor(code, message = code, details = null) {
    super(message);
    this.name = "FeatureUserQuotaPolicyError";
    this.code = code;
    this.details = details;
  }
}

function featureKey(value) {
  const key = typeof value === "string" ? value.trim() : "";
  if (!key || key.length > 64 || !/^[a-z0-9_:-]+$/i.test(key)) {
    throw new FeatureUserQuotaPolicyError("FEATURE_USER_QUOTA_INVALID", "功能额度参数无效");
  }
  return key;
}

function userId(value) {
  const id = typeof value === "string" ? value.trim() : "";
  if (!id || id.length > 160) throw new FeatureUserQuotaPolicyError("FEATURE_USER_QUOTA_INVALID", "用户身份无效");
  return id;
}

function limit(value) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 10000000) {
    throw new FeatureUserQuotaPolicyError("FEATURE_USER_QUOTA_INVALID", "每日上限必须是 1 到 10000000 的整数");
  }
  return parsed;
}

function normalizePolicy(row = {}, identity = {}) {
  return {
    featureKey: featureKey(row.feature_key ?? row.featureKey ?? identity.featureKey),
    dailyRequestLimit: limit(row.daily_request_limit ?? row.dailyRequestLimit),
    enabled: row.enabled !== false,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
  };
}

function firstRow(data) { return Array.isArray(data) ? data[0] : data; }

function createFeatureUserQuotaPolicyService({ db, adminAudit = null } = {}) {
  if (!db || typeof db.from !== "function") throw new Error("Feature user quota database client is required");
  async function listPolicies() {
    const result = await db.from("ai_feature_user_quota_policies").select("*").order("updated_at", { ascending: false });
    if (result?.error) throw new FeatureUserQuotaPolicyError("FEATURE_USER_QUOTA_READ_FAILED", "功能个人额度读取失败");
    return (Array.isArray(result.data) ? result.data : []).map((row) => normalizePolicy(row));
  }
  async function resolve(feature) {
    const key = featureKey(feature);
    const result = await db.from("ai_feature_user_quota_policies").select("*").eq("feature_key", key).maybeSingle();
    if (result?.error) throw new FeatureUserQuotaPolicyError("FEATURE_USER_QUOTA_READ_FAILED", "功能个人额度读取失败");
    return result.data ? normalizePolicy(result.data, { featureKey: key }) : normalizePolicy({ featureKey: key }, { featureKey: key });
  }
  async function savePolicy(actorUserId, input = {}) {
    const key = featureKey(input.featureKey);
    const normalized = normalizePolicy({ ...input, featureKey: key }, { featureKey: key });
    const record = { feature_key: key, daily_request_limit: normalized.dailyRequestLimit, enabled: normalized.enabled, updated_by: typeof actorUserId === "string" ? actorUserId.slice(0, 160) : null, updated_at: new Date().toISOString() };
    const result = await db.from("ai_feature_user_quota_policies").upsert(record, { onConflict: "feature_key" }).select("*").maybeSingle();
    if (result?.error) throw new FeatureUserQuotaPolicyError("FEATURE_USER_QUOTA_SAVE_FAILED", "功能个人额度保存失败");
    const saved = normalizePolicy(result.data ?? record, { featureKey: key });
    await adminAudit?.record?.({ actorUserId, action: "ai_feature_user_quota_policy.upsert", resourceType: "ai_feature_user_quota_policy", resourceId: key, after: saved, result: "succeeded" });
    return saved;
  }
  async function assertAllowed({ userId: id, featureKey: feature } = {}) {
    const policy = await resolve(feature);
    if (!policy.enabled || policy.dailyRequestLimit === null) return { limited: false, policy, usage: null };
    if (typeof db.rpc !== "function") throw new FeatureUserQuotaPolicyError("FEATURE_USER_QUOTA_UNAVAILABLE", "功能个人额度服务暂不可用");
    const result = await db.rpc("consume_ai_feature_user_quota", { p_user_id: userId(id), p_feature_key: policy.featureKey, p_daily_limit: policy.dailyRequestLimit });
    if (result?.error) throw new FeatureUserQuotaPolicyError("FEATURE_USER_QUOTA_UNAVAILABLE", "功能个人额度服务暂不可用");
    const row = firstRow(result.data);
    const usage = { usedCount: Number(row?.used_count ?? 0), remaining: Number(row?.remaining ?? 0), windowStartedAt: row?.window_started_at ?? null };
    if (!row?.allowed) throw new FeatureUserQuotaPolicyError("FEATURE_USER_QUOTA_EXCEEDED", "该功能今日个人额度已用尽", { policy, usage });
    return { limited: true, policy, usage };
  }
  return { listPolicies, resolve, savePolicy, assertAllowed };
}

module.exports = { FeatureUserQuotaPolicyError, createFeatureUserQuotaPolicyService, normalizePolicy };
