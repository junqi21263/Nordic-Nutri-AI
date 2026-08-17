const HEALTH_STATUSES = new Set(["configured", "healthy", "degraded", "unavailable"]);

const PROVIDER_KEYS = ["vision", "deepseek", "hunyuan"];

function percentile(values, fraction) {
  const sorted = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

function statusForProvider({ configured, traces }) {
  if (!configured) return "unavailable";
  if (!traces.length) return "configured";
  const failures = traces.filter((row) => row.status !== "succeeded").length;
  const timeouts = traces.filter((row) => row.status === "timed_out").length;
  const failureRate = failures / traces.length;
  const timeoutRate = timeouts / traces.length;
  return failureRate > 0.1 || timeoutRate > 0.05 || (percentile(traces.map((row) => Number(row.duration_ms)), 0.95) || 0) > 10000
    ? "degraded"
    : "healthy";
}

function mapProvider(key, configured, traces) {
  const safeTraces = traces.map((row) => ({
    status: row.status,
    duration_ms: row.duration_ms,
  }));
  return {
    key,
    status: statusForProvider({ configured, traces: safeTraces }),
    configured,
    recentRequests: safeTraces.length,
    successRate: safeTraces.length
      ? safeTraces.filter((row) => row.status === "succeeded").length / safeTraces.length
      : null,
  };
}

function summarizeWindow(rows, sinceMs) {
  const selected = rows.filter((row) => new Date(row.started_at || 0).getTime() >= sinceMs);
  const durations = selected.map((row) => Number(row.duration_ms)).filter(Number.isFinite);
  const count4xx = selected.filter((row) => Number(row.http_status) >= 400 && Number(row.http_status) < 500).length;
  const count5xx = selected.filter((row) => Number(row.http_status) >= 500).length;
  const timeout = selected.filter((row) => row.status === "timed_out").length;
  const rateLimited = selected.filter((row) => row.status === "rate_limited" || Number(row.http_status) === 429).length;
  const succeeded = selected.filter((row) => row.status === "succeeded").length;
  return {
    requests: selected.length,
    succeeded,
    failed: selected.length - succeeded,
    successRate: selected.length ? succeeded / selected.length : null,
    p50Ms: percentile(durations, 0.5),
    p95Ms: percentile(durations, 0.95),
    p99Ms: percentile(durations, 0.99),
    errors4xx: count4xx,
    errors5xx: count5xx,
    timeout,
    rateLimited,
  };
}

function createSystemHealthService({ db, observability, jobOps, providerConfig = {} } = {}) {
  async function probeDatabase() {
    try {
      const result = await db.from("ops_metric_events").select("metric").limit(1);
      if (result?.error) throw new Error("PG probe failed");
      return { status: "healthy", latencyMs: null };
    } catch (error) {
      return { status: "unavailable", latencyMs: null, errorCode: "PG_UNAVAILABLE" };
    }
  }

  async function loadTraces() {
    const result = await db.from("ops_request_traces")
      .select("status,http_status,duration_ms,started_at,provider,error_code,feature")
      .gte("started_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order("started_at", { ascending: false })
      .limit(10000);
    if (result?.error) throw new Error("Trace health data unavailable");
    return result.data || [];
  }

  async function getHealth() {
    const database = await probeDatabase();
    let traces = [];
    let traceDataStatus = "healthy";
    try {
      traces = await loadTraces();
    } catch {
      traceDataStatus = "unavailable";
    }

    const now = Date.now();
    const windows = {
      last1h: summarizeWindow(traces, now - 60 * 60 * 1000),
      last24h: summarizeWindow(traces, now - 24 * 60 * 60 * 1000),
    };
    const providers = Object.fromEntries(PROVIDER_KEYS.map((key) => [
      key,
      mapProvider(key, providerConfig[key]?.configured === true, traces.filter((row) => row.provider === key)),
    ]));
    let latestJobs = { items: [] };
    try {
      if (typeof jobOps?.listJobs === "function") latestJobs = await jobOps.listJobs();
    } catch {
      latestJobs = { items: [], status: "unavailable" };
    }
    const components = {
      function: { status: "healthy" },
      database,
      traces: { status: traceDataStatus },
      providers,
      jobs: latestJobs,
    };
    const providerStatuses = Object.values(providers).map((provider) => provider.status);
    const overall = database.status === "unavailable" || traceDataStatus === "unavailable"
      ? "unhealthy"
      : providerStatuses.some((status) => status === "degraded" || status === "unavailable")
        ? "degraded" : "healthy";
    const recentExceptions = traces
      .filter((row) => row.status !== "succeeded")
      .slice(0, 10)
      .map((row) => ({
        status: row.status,
        httpStatus: row.http_status ?? null,
        durationMs: row.duration_ms ?? null,
        startedAt: row.started_at || null,
        provider: row.provider || null,
        feature: row.feature || null,
        errorCode: row.error_code || null,
      }));
    return {
      overall,
      generatedAt: new Date().toISOString(),
      components,
      windows,
      providers,
      recentExceptions,
      latestJobs: latestJobs.items || [],
    };
  }

  return { getHealth };
}

module.exports = { HEALTH_STATUSES, createSystemHealthService, percentile, summarizeWindow, statusForProvider };

