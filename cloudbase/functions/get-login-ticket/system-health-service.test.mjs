import assert from "node:assert/strict";
import test from "node:test";
import { createSystemHealthService, statusForProvider } from "./system-health-service.cjs";

function createDb({ traces = [], probeError = null } = {}) {
  return {
    from(table) {
      if (table === "ops_metric_events") {
        return { select() { return { limit: async () => ({ data: [], error: probeError }) }; } };
      }
      assert.equal(table, "ops_request_traces");
      const chain = {
        gte() { return chain; },
        order() { return chain; },
        limit: async () => ({ data: traces, error: null }),
      };
      return { select() { return chain; } };
    },
  };
}

test("provider with no recent calls remains configured, not falsely healthy", () => {
  assert.equal(statusForProvider({ configured: true, traces: [] }), "configured");
  assert.equal(statusForProvider({ configured: false, traces: [] }), "unavailable");
});

test("health reports windows, latency percentiles, provider state and latest jobs without provider calls", async () => {
  const now = Date.now();
  const traces = [
    { status: "succeeded", http_status: 200, duration_ms: 100, started_at: new Date(now - 10_000).toISOString(), provider: "vision", feature: "vision" },
    { status: "timed_out", http_status: 504, duration_ms: 12_000, started_at: new Date(now - 20_000).toISOString(), provider: "vision", feature: "vision", error_code: "VISION_TIMEOUT" },
    { status: "rate_limited", http_status: 429, duration_ms: 50, started_at: new Date(now - 2 * 60 * 60 * 1000).toISOString(), provider: "deepseek", feature: "coach", error_code: "RATE_LIMITED" },
  ];
  let providerCalls = 0;
  const service = createSystemHealthService({
    db: createDb({ traces }),
    providerConfig: { vision: { configured: true }, deepseek: { configured: true }, hunyuan: { configured: false } },
    jobOps: { listJobs: async () => ({ items: [{ key: "food_image_worker", lastRun: { status: "succeeded" } }] }) },
    providers: { call: () => { providerCalls += 1; } },
  });
  const health = await service.getHealth();
  assert.equal(health.overall, "degraded");
  assert.equal(health.windows.last1h.timeout, 1);
  assert.equal(health.windows.last1h.errors5xx, 1);
  assert.equal(health.windows.last1h.p95Ms, 12000);
  assert.equal(health.windows.last24h.rateLimited, 1);
  assert.equal(health.providers.vision.status, "degraded");
  assert.equal(health.providers.hunyuan.status, "unavailable");
  assert.equal(health.latestJobs[0].lastRun.status, "succeeded");
  assert.equal(providerCalls, 0);
});

test("processing traces are in flight, not failures", async () => {
  const now = Date.now();
  const service = createSystemHealthService({
    db: createDb({ traces: [
      { status: "processing", http_status: 202, duration_ms: 6100, started_at: new Date(now - 10_000).toISOString(), provider: "vision", feature: "vision" },
      { status: "succeeded", http_status: 200, duration_ms: 100, started_at: new Date(now - 20_000).toISOString(), provider: "vision", feature: "vision" },
    ] }),
    providerConfig: { vision: { configured: true } },
  });

  const health = await service.getHealth();
  assert.equal(health.windows.last1h.processing, 1);
  assert.equal(health.windows.last1h.failed, 0);
  assert.equal(health.windows.last1h.successRate, 1);
});

test("database and trace data failure produces partial unhealthy response without raw errors", async () => {
  const service = createSystemHealthService({
    db: {
      from(table) {
        if (table === "ops_metric_events") return { select: () => ({ limit: async () => ({ error: new Error("secret db password") }) }) };
        return { select: () => ({ gte: () => ({ order: () => ({ limit: async () => ({ error: new Error("raw trace secret") }) }) }) }) };
      },
    },
    providerConfig: { vision: { configured: false }, deepseek: { configured: false }, hunyuan: { configured: false } },
  });
  const health = await service.getHealth();
  assert.equal(health.overall, "unhealthy");
  assert.equal(health.components.database.status, "unavailable");
  assert.equal(health.components.traces.status, "unavailable");
  assert.equal(JSON.stringify(health).includes("secret"), false);
});

test("dashboard counts authoritative records and unique trace visitors in Beijing time", async () => {
  const requests = [];
  const counts = { app_users: [12, 2], meal_records: [34, 3], ops_request_traces: [10, 8] };
  const traceUsers = [{ user_hash: "user-a" }, { user_hash: "user-a" }, { user_hash: "user-b" }, { user_hash: null }];
  const db = { from(table) {
    const filters = [];
    let countQuery = false;
    let range = [0, 999];
    const chain = {
      select(columns, options) { countQuery = options?.count === "exact"; if (countQuery) assert.deepEqual(options, { count: "exact", head: true }); else assert.equal(columns, "user_hash"); return chain; },
      neq(key, value) { filters.push(["neq", key, value]); return chain; },
      eq(key, value) { filters.push(["eq", key, value]); return chain; },
      is(key, value) { filters.push(["is", key, value]); return chain; },
      gte(key, value) { filters.push(["gte", key, value]); return chain; },
      lt(key, value) { filters.push(["lt", key, value]); return chain; },
      order() { return chain; },
      range(from, to) { range = [from, to]; return chain; },
      then(resolve) {
        requests.push({ table, filters, countQuery, range });
        resolve(countQuery ? { count: counts[table].shift(), error: null } : { data: traceUsers.slice(range[0], range[1] + 1), error: null });
      },
    };
    return chain;
  } };
  const summary = await createSystemHealthService({ db, clock: () => Date.parse("2026-10-21T17:00:00Z") }).getDashboardSummary();
  assert.deepEqual(summary, { day: "2026-10-22", totalUsers: 12, todayNewUsers: 2, currentMeals: 34, todayMeals: 3,
    terminalRequests: 10, successfulRequests: 8, todayApiSuccessRate: 0.8, todayActiveAccounts: 2 });
  assert.equal(requests.filter(({ countQuery, filters }) => countQuery && filters.some(([operation, key, value]) => operation === "gte" && value === "2026-10-21T16:00:00.000Z")).length, 4);
  assert.equal(requests.filter(({ countQuery, filters }) => countQuery && filters.some(([operation, key, value]) => operation === "lt" && value === "2026-10-22T16:00:00.000Z")).length, 4);
  assert.equal(requests.filter(({ table, countQuery }) => table === "ops_request_traces" && !countQuery).length, 1);
});
