const { randomUUID } = require("node:crypto");
const {
  sanitizeAuditSnapshot,
  sanitizeTraceMeta,
  sanitizeTraceStage,
} = require("./observability-sanitizer.cjs");

const TRACE_STATUSES = new Set([
  "running",
  "processing",
  "succeeded",
  "failed",
  "cancelled",
  "rate_limited",
  "timed_out",
]);
const OBSERVABILITY_WRITE_TIMEOUT_MS = 100;

function withBestEffortTimeout(operation, timeoutMs = OBSERVABILITY_WRITE_TIMEOUT_MS) {
  return Promise.race([
    Promise.resolve(operation),
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("observability write timed out")), timeoutMs);
    }),
  ]);
}

function createTraceId() {
  return `trace_${randomUUID()}`;
}

function normalizeTraceStatus(status, fallback = "failed") {
  return TRACE_STATUSES.has(status) ? status : fallback;
}

function durationBetween(startedAt, completedAt) {
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  return Math.max(0, Math.round(end - start));
}

function boundedText(value, max = 200) {
  return typeof value === "string" ? value.trim().slice(0, max) : null;
}

function percentile95(values) {
  const sorted = [...values].filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

function sumMetricRows(rows, metric) {
  return (rows ?? [])
    .filter((row) => row.metric === metric)
    .reduce((total, row) => total + Number(row.value ?? 0), 0);
}

function metricValues(rows, metric) {
  return (rows ?? [])
    .filter((row) => row.metric === metric)
    .map((row) => Number(row.value))
    .filter((value) => Number.isFinite(value));
}

function shanghaiDayKey(iso) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const shifted = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function todayShanghaiKey() {
  return shanghaiDayKey(new Date().toISOString());
}

function enumerateDays(days) {
  const count = Math.min(90, Math.max(1, Number(days) || 14));
  const today = todayShanghaiKey();
  const end = new Date(`${today}T12:00:00+08:00`);
  const keys = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const day = new Date(end.getTime() - i * 24 * 60 * 60 * 1000);
    keys.push(shanghaiDayKey(day.toISOString()));
  }
  return keys;
}

function buildDaySeries(dayKeys, rows, metrics) {
  const metricSet = new Set(Array.isArray(metrics) ? metrics : [metrics]);
  const totals = Object.fromEntries(dayKeys.map((key) => [key, 0]));
  for (const row of rows ?? []) {
    if (!metricSet.has(row.metric)) continue;
    const key = shanghaiDayKey(row.created_at || row.createdAt);
    if (!key || !(key in totals)) continue;
    totals[key] += Number(row.value ?? 0) || 0;
  }
  return dayKeys.map((date) => ({ date, value: totals[date] }));
}

function readMeta(row) {
  const meta = row?.meta;
  if (!meta) return {};
  if (typeof meta === "string") {
    try { return JSON.parse(meta) || {}; } catch { return {}; }
  }
  return typeof meta === "object" ? meta : {};
}

function rowModel(row) {
  const meta = readMeta(row);
  return typeof meta.model === "string" ? meta.model.trim() : "";
}

function rowFeature(row) {
  const meta = readMeta(row);
  return typeof meta.feature === "string" ? meta.feature.trim() : "";
}

const TRACE_LIST_COLUMNS = [
  "trace_id",
  "client_request_id",
  "user_hash",
  "feature",
  "status",
  "last_stage",
  "started_at",
  "completed_at",
  "duration_ms",
  "http_status",
  "error_code",
  "provider",
  "fallback_used",
  "expires_at",
].join(",");

const TRACE_DETAIL_COLUMNS = [
  TRACE_LIST_COLUMNS,
  "provider_request_id_hash",
  "stages_json",
  "meta_json",
].join(",");

function parseJsonObject(value) {
  if (!value) return {};
  if (typeof value === "string") {
    try { return JSON.parse(value) || {}; } catch { return {}; }
  }
  return typeof value === "object" && !Array.isArray(value) ? value : {};
}

function parseJsonArray(value) {
  if (!value) return [];
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return []; }
  }
  return Array.isArray(value) ? value : [];
}

function mapTraceListRow(row = {}) {
  return {
    traceId: boundedText(row.trace_id, 160),
    clientRequestId: boundedText(row.client_request_id, 80),
    userHash: boundedText(row.user_hash, 200),
    feature: boundedText(row.feature, 80),
    status: normalizeTraceStatus(row.status),
    lastStage: boundedText(row.last_stage, 120),
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null,
    durationMs: Number.isFinite(Number(row.duration_ms)) ? Number(row.duration_ms) : null,
    httpStatus: Number.isInteger(row.http_status) ? row.http_status : null,
    errorCode: boundedText(row.error_code, 80),
    provider: boundedText(row.provider, 80),
    fallbackUsed: row.fallback_used === true,
    expiresAt: row.expires_at || null,
  };
}

function mapTraceDetailRow(row = {}) {
  return {
    ...mapTraceListRow(row),
    providerRequestIdHash: boundedText(row.provider_request_id_hash, 200),
    stages: parseJsonArray(row.stages_json)
      .map((stage) => sanitizeTraceStage(stage))
      .filter((stage) => stage.name),
    meta: sanitizeTraceMeta(parseJsonObject(row.meta_json)),
  };
}

function buildDiagnosticPackage(trace = {}) {
  const meta = trace.meta || {};
  const request = {
    traceId: trace.traceId || null,
    clientRequestId: trace.clientRequestId || null,
    requestTime: meta.requestTime || trace.startedAt || null,
    route: meta.route || null,
    method: meta.method || null,
    clientVersion: meta.clientVersion || null,
    environment: meta.environment || null,
    userHash: trace.userHash || null,
  };
  if (meta.source) request.source = meta.source;
  return {
    request,
    runtime: {
      environment: meta.environment || null,
      functionVersion: meta.functionVersion || null,
      artifactSha: meta.artifactSha || null,
      sanitizationVersion: meta.sanitizationVersion || null,
    },
    vision: {
      feature: trace.feature || null,
      provider: trace.provider || meta.provider || null,
      model: meta.model || null,
      providerRequestIdHash: trace.providerRequestIdHash || meta.providerRequestIdHash || null,
      providerHttpStatus: meta.providerHttpStatus ?? null,
      stage: meta.stage || trace.lastStage || null,
      stageDurationMs: meta.stageDurationMs ?? null,
      lastSuccessfulStage: meta.lastSuccessfulStage || null,
      fallbackUsed: trace.fallbackUsed === true,
      imageMimeType: meta.imageMimeType || null,
      imageBytes: meta.imageBytes ?? null,
      originalContentType: meta.originalContentType || null,
      finalContentType: meta.finalContentType || null,
      originalBytes: meta.originalBytes ?? null,
      finalBytes: meta.finalBytes ?? null,
      originalWidth: meta.originalWidth ?? null,
      originalHeight: meta.originalHeight ?? null,
      finalWidth: meta.finalWidth ?? null,
      finalHeight: meta.finalHeight ?? null,
      orientation: meta.orientation || null,
      imagePrepareDurationMs: meta.imagePrepareDurationMs ?? null,
      imageReadDurationMs: meta.imageReadDurationMs ?? null,
      imageSha256: meta.imageSha256 || null,
      objectSize: meta.objectSize ?? null,
      tempUrlGenerationMs: meta.tempUrlGenerationMs ?? null,
      timeoutBudgetMs: meta.timeoutBudgetMs ?? null,
      providerRequestDurationMs: meta.providerRequestDurationMs ?? null,
      providerErrorCode: meta.providerErrorCode || null,
      providerErrorType: meta.providerErrorType || null,
    },
    quota: {
      reservationId: meta.quotaReservationId || null,
      state: meta.quotaState || null,
      delta: meta.quotaDelta ?? null,
    },
    database: {
      sqlstate: meta.sqlstate || null,
      rpcName: meta.rpcName || null,
      constraint: meta.constraint || null,
    },
    result: {
      status: trace.status || null,
      httpStatus: trace.httpStatus ?? null,
      businessCode: meta.businessCode || trace.errorCode || null,
      errorCode: trace.errorCode || null,
      analysisId: meta.analysisId || null,
      durationMs: trace.durationMs ?? null,
      requestTotalDurationMs: meta.requestTotalDurationMs ?? null,
      remainingBudgetMs: meta.remainingBudgetMs ?? null,
      retryCount: meta.retryCount ?? 0,
    },
    replayHints: {
      environment: meta.environment || null,
      route: meta.route || null,
      method: meta.method || null,
      requestSchemaSummary: meta.requestSchemaSummary || null,
      source: meta.source || null,
      imageMimeType: meta.imageMimeType || null,
      imageBytes: meta.imageBytes ?? null,
      originalContentType: meta.originalContentType || null,
      finalContentType: meta.finalContentType || null,
      originalBytes: meta.originalBytes ?? null,
      finalBytes: meta.finalBytes ?? null,
      originalWidth: meta.originalWidth ?? null,
      originalHeight: meta.originalHeight ?? null,
      finalWidth: meta.finalWidth ?? null,
      finalHeight: meta.finalHeight ?? null,
      orientation: meta.orientation || null,
      requestTotalDurationMs: meta.requestTotalDurationMs ?? null,
      remainingBudgetMs: meta.remainingBudgetMs ?? null,
      imageSha256: meta.imageSha256 || null,
      provider: trace.provider || meta.provider || null,
      model: meta.model || null,
      timeoutBudgetMs: meta.timeoutBudgetMs ?? null,
      providerRequestDurationMs: meta.providerRequestDurationMs ?? null,
      providerHttpStatus: meta.providerHttpStatus ?? null,
      providerErrorCode: meta.providerErrorCode || null,
      providerErrorType: meta.providerErrorType || null,
      failedStage: meta.stage || trace.lastStage || null,
      fixtureRequired: true,
    },
  };
}

function mapAuditRow(row = {}) {
  const safeSnapshot = (value) => sanitizeAuditSnapshot(parseJsonObject(value));
  return {
    id: boundedText(row.id, 160),
    actorUserId: boundedText(row.actor_user_id, 160),
    action: boundedText(row.action, 120),
    resourceType: boundedText(row.resource_type, 80),
    resourceId: boundedText(row.resource_id, 200),
    before: safeSnapshot(row.before_snapshot),
    after: safeSnapshot(row.after_snapshot),
    result: ["succeeded", "failed", "rejected"].includes(row.result) ? row.result : "failed",
    errorCode: boundedText(row.error_code, 80),
    traceId: boundedText(row.trace_id, 160),
    createdAt: row.created_at || null,
    expiresAt: row.expires_at || null,
  };
}

function mapJobRunRow(row = {}) {
  return {
    id: boundedText(row.id, 160),
    jobKey: boundedText(row.job_key, 120),
    configured: row.configured === true,
    runtimeBindingStatus: ["verified", "unknown", "unavailable"].includes(row.runtime_binding_status)
      ? row.runtime_binding_status : "unknown",
    trigger: ["schedule", "manual", "internal", "startup", "unknown"].includes(row.trigger)
      ? row.trigger : "unknown",
    status: ["running", "succeeded", "failed", "cancelled"].includes(row.status) ? row.status : "failed",
    startedAt: row.started_at || null,
    completedAt: row.completed_at || null,
    durationMs: Number.isFinite(Number(row.duration_ms)) ? Number(row.duration_ms) : null,
    processedCount: Number.isInteger(row.processed_count) ? row.processed_count : null,
    errorCode: boundedText(row.error_code, 80),
    errorSummary: boundedText(row.error_summary, 200),
    traceId: boundedText(row.trace_id, 160),
    expiresAt: row.expires_at || null,
  };
}

const MODEL_REQUEST_METRICS = new Set([
  "vision_success",
  "vision_failure",
  "coach_message",
  "coach_limited",
  "rate_limited",
  "model_request",
]);

const MODEL_TOKEN_METRICS = new Set([
  "model_tokens",
  "model_tokens_input",
  "model_tokens_output",
]);

function createObservabilityService({ db }) {
  if (!db || typeof db.from !== "function") {
    throw new Error("Observability database is unavailable");
  }

  async function loadMetricRows({ sinceIso, limit = 5000 } = {}) {
    let query = db.from("ops_metric_events").select("metric,value,meta,created_at");
    if (sinceIso) query = query.gte("created_at", sinceIso);
    const result = await query
      .order("created_at", { ascending: false })
      .limit(Math.min(10000, Math.max(1, Number(limit) || 5000)));
    if (result?.error) throw new Error("Ops metrics read failed");
    return result.data ?? [];
  }

  async function recordMetric(metric, value = 1, meta = {}) {
    try {
      const result = await withBestEffortTimeout(db.from("ops_metric_events").insert({
        metric,
        value,
        meta: sanitizeTraceMeta(meta),
      }));
      if (result?.error) throw new Error("metric insert failed");
    } catch (error) {
      console.warn("[observability] recordMetric failed:", metric, error?.message || error);
    }
  }

  function startTrace(input = {}) {
    const startedAt = new Date().toISOString();
    return {
      traceId: createTraceId(),
      clientRequestId: boundedText(input.clientRequestId, 80),
      userHash: boundedText(input.userHash, 200),
      feature: boundedText(input.feature, 80) || "unknown",
      startedAt,
      status: "running",
      lastStage: null,
      stages: [],
    };
  }

  function recordStage(trace, stage = {}) {
    if (!trace || typeof trace !== "object") return null;
    const safeStage = sanitizeTraceStage(stage);
    if (!safeStage.name) return null;
    trace.stages.push(safeStage);
    trace.lastStage = safeStage.name;
    return safeStage;
  }

  async function finishTrace(trace, result = {}) {
    if (!trace || typeof trace !== "object" || !trace.traceId) {
      return { recorded: false, traceId: null };
    }
    const completedAt = new Date().toISOString();
    const status = normalizeTraceStatus(result.status);
    const payload = {
      trace_id: trace.traceId,
      client_request_id: trace.clientRequestId || null,
      user_hash: trace.userHash || null,
      feature: trace.feature,
      status,
      last_stage: trace.lastStage || null,
      started_at: trace.startedAt,
      completed_at: completedAt,
      duration_ms: durationBetween(trace.startedAt, completedAt),
      http_status: Number.isInteger(result.httpStatus) ? result.httpStatus : null,
      error_code: boundedText(result.errorCode, 80),
      provider: boundedText(result.provider, 80),
      provider_request_id_hash: boundedText(result.providerRequestIdHash, 200),
      fallback_used: result.fallbackUsed === true,
      stages_json: trace.stages.map((stage) => sanitizeTraceStage(stage)).filter((stage) => stage.name),
      meta_json: sanitizeTraceMeta(result.meta),
    };
    try {
      const insertResult = await withBestEffortTimeout(db.from("ops_request_traces").insert(payload));
      if (insertResult?.error) throw new Error("trace insert failed");
      return { recorded: true, traceId: trace.traceId };
    } catch (error) {
      console.warn("[observability] finishTrace failed:", trace.traceId, error?.message || error);
      return { recorded: false, traceId: trace.traceId };
    }
  }

  async function recordJobRun(input = {}) {
    const startedAt = input.startedAt || new Date().toISOString();
    const completedAt = input.completedAt || null;
    const payload = {
      job_key: boundedText(input.jobKey, 120) || "unknown",
      configured: input.configured === true,
      runtime_binding_status: ["verified", "unknown", "unavailable"].includes(input.runtimeBindingStatus)
        ? input.runtimeBindingStatus
        : "unknown",
      trigger: ["schedule", "manual", "internal", "startup", "unknown"].includes(input.trigger)
        ? input.trigger
        : "unknown",
      status: ["running", "succeeded", "failed", "cancelled"].includes(input.status)
        ? input.status
        : "failed",
      started_at: startedAt,
      completed_at: completedAt,
      duration_ms: completedAt ? durationBetween(startedAt, completedAt) : null,
      processed_count: Number.isInteger(input.processedCount) && input.processedCount >= 0 ? input.processedCount : null,
      error_code: boundedText(input.errorCode, 80),
      error_summary: boundedText(input.errorSummary, 200),
      trace_id: boundedText(input.traceId, 160),
    };
    try {
      const result = await withBestEffortTimeout(db.from("ops_job_runs").insert(payload));
      if (result?.error) throw new Error("job run insert failed");
      return { recorded: true };
    } catch (error) {
      console.warn("[observability] recordJobRun failed:", payload.job_key, error?.message || error);
      return { recorded: false };
    }
  }

  async function recordAdminAudit(input = {}) {
    const result = await db.from("admin_audit_logs").insert({
      actor_user_id: input.actorUserId || null,
      action: boundedText(input.action, 120) || "unknown",
      resource_type: boundedText(input.resourceType, 80) || "unknown",
      resource_id: boundedText(input.resourceId, 200),
      before_snapshot: sanitizeAuditSnapshot(input.before),
      after_snapshot: sanitizeAuditSnapshot(input.after),
      result: ["succeeded", "failed", "rejected"].includes(input.result) ? input.result : "failed",
      error_code: boundedText(input.errorCode, 80),
      trace_id: boundedText(input.traceId, 160),
    });
    if (result?.error) throw new Error("admin audit insert failed");
    return { recorded: true };
  }

  async function listTraces({
    traceId,
    userHash,
    feature,
    stage,
    status,
    errorCode,
    from,
    to,
    page = 1,
    limit = 50,
  } = {}) {
    const pageSize = Math.min(200, Math.max(1, Number(limit) || 50));
    const pageNumber = Math.min(100000, Math.max(1, Number(page) || 1));
    let query = db
      .from("ops_request_traces")
      .select(TRACE_LIST_COLUMNS, { count: "exact" });
    if (traceId) query = query.eq("trace_id", boundedText(traceId, 160));
    if (userHash) query = query.eq("user_hash", boundedText(userHash, 200));
    if (feature) query = query.eq("feature", boundedText(feature, 80));
    if (stage) query = query.eq("last_stage", boundedText(stage, 120));
    if (status && TRACE_STATUSES.has(status)) query = query.eq("status", status);
    if (errorCode) query = query.eq("error_code", boundedText(errorCode, 80));
    if (from) query = query.gte("started_at", from);
    if (to) query = query.lte("started_at", to);
    const result = await query
      .order("started_at", { ascending: false })
      .range((pageNumber - 1) * pageSize, pageNumber * pageSize - 1);
    if (result?.error) throw new Error("Trace query failed");
    return {
      items: (result?.data ?? []).map(mapTraceListRow),
      page: pageNumber,
      pageSize,
      total: Number.isInteger(result?.count) ? result.count : (result?.data?.length ?? 0),
    };
  }

  async function getTraceDetail(traceId) {
    const safeTraceId = boundedText(traceId, 160);
    if (!safeTraceId) return null;
    const result = await db
      .from("ops_request_traces")
      .select(TRACE_DETAIL_COLUMNS)
      .eq("trace_id", safeTraceId)
      .maybeSingle();
    if (result?.error) throw new Error("Trace query failed");
    return result?.data ? mapTraceDetailRow(result.data) : null;
  }

  async function getDiagnosticPackage(traceId) {
    const trace = await getTraceDetail(traceId);
    return trace ? buildDiagnosticPackage(trace) : null;
  }

  async function listAuditLogs({
    actorUserId,
    action,
    resourceType,
    resourceId,
    result: outcome,
    traceId,
    from,
    to,
    page = 1,
    limit = 50,
  } = {}) {
    const pageSize = Math.min(200, Math.max(1, Number(limit) || 50));
    const pageNumber = Math.min(100000, Math.max(1, Number(page) || 1));
    let query = db.from("admin_audit_logs").select(
      "id,actor_user_id,action,resource_type,resource_id,before_snapshot,after_snapshot,result,error_code,trace_id,created_at,expires_at",
      { count: "exact" },
    );
    if (actorUserId) query = query.eq("actor_user_id", boundedText(actorUserId, 160));
    if (action) query = query.eq("action", boundedText(action, 120));
    if (resourceType) query = query.eq("resource_type", boundedText(resourceType, 80));
    if (resourceId) query = query.eq("resource_id", boundedText(resourceId, 200));
    if (outcome && ["succeeded", "failed", "rejected"].includes(outcome)) query = query.eq("result", outcome);
    if (traceId) query = query.eq("trace_id", boundedText(traceId, 160));
    if (from) query = query.gte("created_at", from);
    if (to) query = query.lte("created_at", to);
    const response = await query
      .order("created_at", { ascending: false })
      .range((pageNumber - 1) * pageSize, pageNumber * pageSize - 1);
    if (response?.error) throw new Error("Audit log query failed");
    return {
      items: (response?.data ?? []).map(mapAuditRow),
      page: pageNumber,
      pageSize,
      total: Number.isInteger(response?.count) ? response.count : (response?.data?.length ?? 0),
    };
  }

  async function listJobRuns({ jobKey, limit = 50 } = {}) {
    const capped = Math.min(200, Math.max(1, Number(limit) || 50));
    let query = db.from("ops_job_runs").select(
      "id,job_key,configured,runtime_binding_status,trigger,status,started_at,completed_at,duration_ms,processed_count,error_code,error_summary,trace_id,expires_at",
    );
    if (jobKey) query = query.eq("job_key", boundedText(jobKey, 120));
    const result = await query.order("started_at", { ascending: false }).limit(capped);
    if (result?.error) throw new Error("Job run query failed");
    return { items: (result?.data ?? []).map(mapJobRunRow) };
  }

  async function getOverview({ hours = 24 } = {}) {
    const windowHours = Math.min(168, Math.max(1, Number(hours) || 24));
    const since = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();
    const rows = await loadMetricRows({ sinceIso: since });
    const success = sumMetricRows(rows, "vision_success");
    const failure = sumMetricRows(rows, "vision_failure");
    const total = success + failure;
    return {
      windowHours,
      vision: {
        success,
        failure,
        failureRate: total ? failure / total : 0,
        p95Ms: percentile95(metricValues(rows, "vision_latency_ms")),
      },
      rateLimited: sumMetricRows(rows, "rate_limited"),
      accountCancel: {
        succeeded: sumMetricRows(rows, "account_cancel_success"),
        failed: sumMetricRows(rows, "account_cancel_failure"),
      },
      coach: {
        messages: sumMetricRows(rows, "coach_message"),
        limited: sumMetricRows(rows, "coach_limited"),
      },
      foodImage: null,
    };
  }

  async function getUsageReport({ days = 14 } = {}) {
    const dayKeys = enumerateDays(days);
    const sinceIso = new Date(`${dayKeys[0]}T00:00:00+08:00`).toISOString();
    const [windowRows, allRows] = await Promise.all([
      loadMetricRows({ sinceIso }),
      loadMetricRows({ limit: 10000 }),
    ]);
    const today = todayShanghaiKey();
    const todayRows = windowRows.filter((row) => shanghaiDayKey(row.created_at || row.createdAt) === today);

    const featureDefs = [
      { key: "vision", label: "食物识别", metrics: ["vision_success"] },
      { key: "coach", label: "营养教练", metrics: ["coach_message"] },
      { key: "rate_limited", label: "限流拦截", metrics: ["rate_limited"] },
      { key: "vision_failure", label: "识别失败", metrics: ["vision_failure"] },
      { key: "coach_limited", label: "教练限流", metrics: ["coach_limited"] },
    ];

    const features = featureDefs.map((def) => {
      const series = buildDaySeries(dayKeys, windowRows, def.metrics);
      return {
        key: def.key,
        label: def.label,
        today: sumMetricRows(todayRows, def.metrics[0]),
        windowTotal: series.reduce((sum, point) => sum + point.value, 0),
        total: sumMetricRows(allRows, def.metrics[0]),
        series,
      };
    });

    return {
      days: dayKeys.length,
      timezone: "Asia/Shanghai",
      today,
      features,
      series: dayKeys.map((date) => ({
        date,
        vision: features.find((item) => item.key === "vision")?.series.find((point) => point.date === date)?.value || 0,
        coach: features.find((item) => item.key === "coach")?.series.find((point) => point.date === date)?.value || 0,
        rateLimited: features.find((item) => item.key === "rate_limited")?.series.find((point) => point.date === date)?.value || 0,
        visionFailure: features.find((item) => item.key === "vision_failure")?.series.find((point) => point.date === date)?.value || 0,
      })),
    };
  }

  async function getModelDetail({ model, days = 30, catalog = [], foodImageSeries = [] } = {}) {
    const modelName = String(model || "").trim();
    if (!modelName) throw new Error("Model name is required");
    const dayKeys = enumerateDays(days);
    const sinceIso = new Date(`${dayKeys[0]}T00:00:00+08:00`).toISOString();
    const [windowRows, allRows] = await Promise.all([
      loadMetricRows({ sinceIso }),
      loadMetricRows({ limit: 10000 }),
    ]);

    const catalogEntries = (catalog || []).filter((entry) => entry?.model === modelName);
    const catalogFeatures = new Set(catalogEntries.map((entry) => entry.feature));
    const isFoodImageModel = catalogFeatures.has("food_image");
    const featureMetricMap = {
      vision: ["vision_success", "vision_failure"],
      coach: ["coach_message", "coach_limited"],
      daily_insight: ["daily_insight"],
      weekly_review: ["weekly_review"],
      nutrition_plan: ["nutrition_plan"],
      daily_tip: ["daily_tip"],
      food_image: [],
    };

    function rowBelongsToModel(row) {
      const explicit = rowModel(row);
      if (explicit) return explicit === modelName;
      const feature = rowFeature(row);
      if (feature && catalogFeatures.has(feature)) return true;
      // Attribute legacy rows that only have metric names, no meta.model.
      for (const [featureKey, metrics] of Object.entries(featureMetricMap)) {
        if (catalogFeatures.has(featureKey) && metrics.includes(row.metric)) return true;
      }
      return false;
    }

    const matchedWindow = windowRows.filter((row) => MODEL_REQUEST_METRICS.has(row.metric) && rowBelongsToModel(row));
    const matchedAll = allRows.filter((row) => MODEL_REQUEST_METRICS.has(row.metric) && rowBelongsToModel(row));
    const tokenWindow = windowRows.filter((row) => MODEL_TOKEN_METRICS.has(row.metric) && rowBelongsToModel(row));
    const tokenAll = allRows.filter((row) => MODEL_TOKEN_METRICS.has(row.metric) && rowBelongsToModel(row));

    let requestSeries = buildDaySeries(dayKeys, matchedWindow, [...MODEL_REQUEST_METRICS]);
    if (isFoodImageModel && Array.isArray(foodImageSeries) && foodImageSeries.length) {
      const byDate = Object.fromEntries(foodImageSeries.map((point) => [point.date, Number(point.value) || 0]));
      requestSeries = dayKeys.map((date) => ({
        date,
        value: (byDate[date] || 0) + (requestSeries.find((point) => point.date === date)?.value || 0),
      }));
    }

    const featureCounts = {};
    for (const row of matchedAll) {
      let feature = rowFeature(row);
      if (!feature) {
        feature = Object.entries(featureMetricMap).find(([, metrics]) => metrics.includes(row.metric))?.[0] || row.metric || "unknown";
      }
      featureCounts[feature] = (featureCounts[feature] || 0) + (Number(row.value) || 0);
    }
    for (const entry of catalogEntries) {
      if (!(entry.feature in featureCounts)) featureCounts[entry.feature] = 0;
    }
    if (isFoodImageModel) {
      const foodTotal = foodImageSeries.reduce((sum, point) => sum + (Number(point.value) || 0), 0);
      featureCounts.food_image = (featureCounts.food_image || 0) + foodTotal;
    }

    const today = todayShanghaiKey();
    const requestWindow = requestSeries.reduce((sum, point) => sum + point.value, 0);
    const requestToday = requestSeries.find((point) => point.date === today)?.value || 0;
    // Prefer window sum for "total" display when all-time sample is capped; keep both.
    const requestAllTime = matchedAll.reduce((sum, row) => sum + (Number(row.value) || 0), 0)
      + (isFoodImageModel ? foodImageSeries.reduce((sum, point) => sum + (Number(point.value) || 0), 0) : 0);
    const requestTotal = Math.max(requestWindow, requestAllTime);

    const tokensInputSeries = buildDaySeries(dayKeys, tokenWindow, ["model_tokens_input"]);
    const tokensOutputSeries = buildDaySeries(dayKeys, tokenWindow, ["model_tokens_output"]);
    const tokensTotalSeries = dayKeys.map((date) => {
      const explicit = tokenWindow
        .filter((row) => shanghaiDayKey(row.created_at || row.createdAt) === date && row.metric === "model_tokens")
        .reduce((sum, row) => sum + (Number(row.value) || 0), 0);
      const input = tokensInputSeries.find((point) => point.date === date)?.value || 0;
      const output = tokensOutputSeries.find((point) => point.date === date)?.value || 0;
      return { date, value: explicit || (input + output), input, output };
    });
    const tokensWindow = tokensTotalSeries.reduce((sum, point) => sum + point.value, 0);
    const tokensTotal = Math.max(tokensWindow, tokenAll.reduce((sum, row) => sum + (Number(row.value) || 0), 0));

    const featureLabel = Object.fromEntries(
      (catalog || []).map((entry) => [entry.feature, entry.featureLabel || entry.feature]),
    );

    return {
      model: modelName,
      provider: catalogEntries[0]?.provider || null,
      days: dayKeys.length,
      today,
      timezone: "Asia/Shanghai",
      features: catalogEntries.map((entry) => ({
        feature: entry.feature,
        featureLabel: entry.featureLabel || entry.feature,
        dailyLimit: entry.dailyLimit ?? null,
        burstLimit: entry.burstLimit ?? null,
      })),
      requests: {
        today: requestToday,
        windowTotal: requestWindow,
        total: requestTotal,
        series: requestSeries,
      },
      tokens: {
        today: tokensTotalSeries.find((point) => point.date === today)?.value || 0,
        windowTotal: tokensWindow,
        total: tokensTotal,
        series: tokensTotalSeries,
        tracked: tokensTotal > 0 || tokensTotalSeries.some((point) => point.value > 0),
        applicable: !isFoodImageModel,
      },
      byFeature: Object.entries(featureCounts)
        .map(([feature, count]) => ({
          feature,
          featureLabel: featureLabel[feature] || feature,
          count,
        }))
        .sort((a, b) => b.count - a.count),
    };
  }

  async function getModelBoard({ days = 30, catalog = [], foodImageSeries = [] } = {}) {
    const uniqueModels = [];
    const seen = new Set();
    for (const entry of catalog || []) {
      const name = String(entry?.model || "").trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      uniqueModels.push(name);
    }
    const boards = [];
    for (const modelName of uniqueModels) {
      boards.push(await getModelDetail({
        model: modelName,
        days,
        catalog,
        foodImageSeries,
      }));
    }
    return {
      days: Math.min(90, Math.max(1, Number(days) || 30)),
      today: todayShanghaiKey(),
      timezone: "Asia/Shanghai",
      models: boards,
    };
  }

  async function listDeletionLog({ limit = 50 } = {}) {
    const capped = Math.min(200, Math.max(1, Number(limit) || 50));
    const result = await db
      .from("ops_account_deletion_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(capped);
    if (result?.error) throw new Error("Deletion log read failed");
    return result.data ?? [];
  }

  async function recordDeletion({ userId, clientRequestId, outcome, errorCode = null }) {
    try {
      await db.from("ops_account_deletion_log").insert({
        user_id: userId,
        client_request_id: clientRequestId,
        outcome,
        error_code: errorCode,
      });
    } catch (error) {
      console.warn("[observability] recordDeletion failed:", outcome, error?.message || error);
    }
  }

  async function purgeExpiredDeletionLogs({ now = new Date() } = {}) {
    const result = await db
      .from("ops_account_deletion_log")
      .delete()
      .lt("expires_at", now.toISOString());
    if (result?.error) throw new Error("Deletion log retention purge failed");
    return { deleted: result?.data?.length || 0 };
  }

  return {
    recordMetric,
    startTrace,
    recordStage,
    finishTrace,
    recordJobRun,
    recordAdminAudit,
    listTraces,
    getTraceDetail,
    getDiagnosticPackage,
    listAuditLogs,
    listJobRuns,
    getOverview,
    getUsageReport,
    getModelDetail,
    getModelBoard,
    listDeletionLog,
    recordDeletion,
    purgeExpiredDeletionLogs,
  };
}

module.exports = {
  createObservabilityService,
  buildDiagnosticPackage,
  createTraceId,
  percentile95,
  shanghaiDayKey,
  todayShanghaiKey,
  enumerateDays,
  buildDaySeries,
};
