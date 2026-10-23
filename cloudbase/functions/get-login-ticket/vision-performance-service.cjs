const { withDbReadRetry } = require("./db-read-retry.cjs");
function object(value) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) || {};
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" ? value : {};
}
function numeric(value) {
  return value !== null &&
    value !== "" &&
    value !== undefined &&
    Number.isFinite(Number(value))
    ? Number(value)
    : NaN;
}
function distribution(values) {
  const sorted = values
    .map(numeric)
    .filter((x) => typeof x === "number" && Number.isFinite(x) && x >= 0)
    .sort((a, b) => a - b);
  const percentile = (p) => {
    if (!sorted.length) return null;
    const x = (sorted.length - 1) * p;
    const lo = Math.floor(x);
    return Math.round(
      sorted[lo] + (sorted[Math.ceil(x)] - sorted[lo]) * (x - lo),
    );
  };
  return {
    count: sorted.length,
    p50Ms: percentile(0.5),
    p95Ms: percentile(0.95),
  };
}
function summarizeVisionPerformance({
  requests = [],
  tasks = [],
  stages = [],
} = {}) {
  const requestGroups = { submit: [], poll: [], other: [] };
  for (const row of requests) {
    const meta = object(row.meta_json);
    const route = String(meta.route || "").replace(/^\/get-login-ticket/, "");
    const phase =
      meta.method === "POST" && route === "/vision-analysis"
        ? "submit"
        : meta.method === "GET" && route.startsWith("/vision-analysis/")
          ? "poll"
          : "other";
    requestGroups[phase].push(row);
  }
  const requestStats = Object.fromEntries(
    Object.entries(requestGroups).map(([k, rows]) => [
      k,
      {
        ...distribution(rows.map((r) => r.duration_ms)),
        requests: rows.length,
        httpErrors: rows.filter((r) => r.http_status >= 400).length,
      },
    ]),
  );
  const completed = tasks.filter((t) => t.status === "completed");
  const failed = tasks.filter((t) =>
    ["failed", "timed_out"].includes(t.status),
  );
  const knownFallback = completed
    .map((t) => object(t.raw_recognition))
    .filter((r) => typeof r.fallbackUsed === "boolean");
  const modelGroups = {};
  for (const t of tasks) {
    const result = object(t.raw_recognition);
    for (const attempt of Array.isArray(result.attempts)
      ? result.attempts
      : []) {
      const key = `${attempt.provider}/${attempt.model}`;
      (modelGroups[key] ||= []).push(attempt);
    }
  }
  const stageGroups = {};
  for (const row of requests) {
    const list = object(row.stages_json);
    for (const stage of Array.isArray(list) ? list : []) {
      if (
        stage.status !== "succeeded" ||
        !Number.isFinite(numeric(stage.durationMs))
      )
        continue;
      (stageGroups[`api.${stage.name}`] ||= []).push(numeric(stage.durationMs));
    }
  }
  const starts = new Map();
  for (const row of requests) {
    const meta = object(row.meta_json);
    if (meta.method === "POST" && meta.analysisId && row.http_status === 202) {
      const end = Date.parse(row.started_at) + numeric(row.duration_ms);
      if (Number.isFinite(end)) starts.set(meta.analysisId, end);
    }
  }
  const claimTimes = new Map();
  for (const row of stages) {
    const m = object(row.meta);
    if (
      m.stage === "worker.claim" &&
      m.status === "succeeded" &&
      m.analysisId
    ) {
      const at = Date.parse(m.startedAt);
      if (Number.isFinite(at))
        claimTimes.set(
          m.analysisId,
          Math.min(claimTimes.get(m.analysisId) ?? Infinity, at),
        );
    }
  }
  const queueWait = Array.from(claimTimes)
    .filter(([id]) => starts.has(id))
    .map(([id, time]) => time - starts.get(id));

  for (const row of stages) {
    const meta = object(row.meta);
    if (
      meta.status !== "succeeded" ||
      !Number.isFinite(meta.durationMs) ||
      meta.durationMs < 0
    )
      continue;
    (stageGroups[meta.stage] ||= []).push(meta.durationMs);
  }
  return {
    requests: requestStats,
    queueAndWorkerStartup: distribution(queueWait),
    tasks: {
      count: tasks.length,
      completed: completed.length,
      failed: failed.length,
      cancelled: tasks.filter((t) => t.status === "cancelled").length,
      pending: tasks.filter(
        (t) =>
          !["completed", "failed", "timed_out", "cancelled"].includes(t.status),
      ).length,
      terminalSuccessRate:
        completed.length + failed.length
          ? completed.length / (completed.length + failed.length)
          : null,
      fallbackObserved: knownFallback.length,
      fallbackRate: knownFallback.length
        ? knownFallback.filter((r) => r.fallbackUsed).length /
          knownFallback.length
        : null,
      duration: distribution(
        completed
          .filter((t) => t.completed_at && t.created_at)
          .map((t) => Date.parse(t.completed_at) - Date.parse(t.created_at)),
      ),
    },
    models: Object.fromEntries(
      Object.entries(modelGroups).map(([k, a]) => [
        k,
        {
          ...distribution(a.map((x) => x.durationMs)),
          attempts: a.length,
          successRate:
            a.filter((x) => x.status === "succeeded").length / a.length,
        },
      ]),
    ),
    stages: Object.fromEntries(
      Object.entries(stageGroups).map(([k, a]) => [k, distribution(a)]),
    ),
  };
}
function createVisionPerformanceService({ db, now = () => new Date() } = {}) {
  return {
    async getReport({ hours = 24 } = {}) {
      const parsed = Number(hours);
      if (!Number.isFinite(parsed) || parsed < 1 || parsed > 168)
        throw Object.assign(new Error("VISION_REPORT_RANGE_INVALID"), {
          code: "VISION_REPORT_RANGE_INVALID",
        });
      const to = now().toISOString(),
        from = new Date(Date.parse(to) - parsed * 3600000).toISOString();
      const limit = 10000,
        pageSize = 1000;
      async function read(table, columns, time, id, filter) {
        const rows = [];
        let truncated = false;
        while (rows.length < limit) {
          const offset = rows.length;
          const r = await withDbReadRetry(() =>
            filter(db.from(table).select(columns).gte(time, from).lte(time, to))
              .order(time, { ascending: true })
              .order(id, { ascending: true })
              .range(offset, offset + pageSize - 1),
          );
          if (r.error) throw r.error;
          const page = r.data || [];
          rows.push(...page);
          if (page.length < pageSize) return { rows, truncated };
        }
        truncated = true;
        return { rows, truncated };
      }
      const [requests, tasks, stages] = await Promise.all([
        read(
          "ops_request_traces",
          "http_status,duration_ms,meta_json,stages_json,started_at",
          "started_at",
          "trace_id",
          (q) => q.eq("feature", "vision"),
        ),
        read(
          "ai_analysis",
          "status,created_at,completed_at,raw_recognition",
          "created_at",
          "id",
          (q) =>
            q.in("dispatch_state", [
              "queued",
              "claimed",
              "running",
              "completed",
              "failed",
            ]),
        ),
        read("ops_metric_events", "meta", "created_at", "id", (q) =>
          q.eq("metric", "vision_async_execution_stage"),
        ),
      ]);
      const truncated =
        requests.truncated || tasks.truncated || stages.truncated;
      return {
        from,
        to,
        scope: "async_tasks_and_vision_requests_including_test_traffic",
        coverage: {
          complete: !truncated,
          rowLimitPerSource: limit,
          requests: requests.rows.length,
          tasks: tasks.rows.length,
          stages: stages.rows.length,
        },
        statistics: truncated
          ? null
          : summarizeVisionPerformance({
              requests: requests.rows,
              tasks: tasks.rows,
              stages: stages.rows,
            }),
      };
    },
  };
}
module.exports = { createVisionPerformanceService, summarizeVisionPerformance };
