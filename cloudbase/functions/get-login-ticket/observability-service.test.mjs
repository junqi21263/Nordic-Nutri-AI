import assert from "node:assert/strict";
import test from "node:test";
import {
  createObservabilityService,
  percentile95,
  shanghaiDayKey,
  buildDaySeries,
  enumerateDays,
} from "./observability-service.cjs";

function createDb({ metrics = [], deletionLog = [] } = {}) {
  const inserts = [];
  const db = {
    from(table) {
      if (table === "ops_metric_events") {
        const state = { since: null, limit: 5000 };
        const finish = () => {
          let rows = metrics;
          if (state.since) {
            rows = rows.filter((row) => String(row.created_at) >= state.since);
          }
          return Promise.resolve({ data: rows.slice(0, state.limit), error: null });
        };
        const chain = {
          gte(_column, value) { state.since = value; return chain; },
          order() { return chain; },
          limit(count) { state.limit = count; return finish(); },
          then(resolve, reject) { return finish().then(resolve, reject); },
        };
        return {
          insert(payload) {
            inserts.push({ table, payload });
            return Promise.resolve({ error: null });
          },
          select() { return chain; },
        };
      }
      if (table === "ops_account_deletion_log") {
        return {
          insert(payload) {
            inserts.push({ table, payload });
            deletionLog.unshift(payload);
            return Promise.resolve({ error: null });
          },
          select() {
            return {
              order() {
                return {
                  limit(count) {
                    return Promise.resolve({ data: deletionLog.slice(0, count), error: null });
                  },
                };
              },
            };
          },
        };
      }
      if (["ops_request_traces", "ops_job_runs", "admin_audit_logs"].includes(table)) {
        return {
          insert(payload) {
            inserts.push({ table, payload });
            return Promise.resolve({ error: null });
          },
        };
      }
      return {
        insert() { return Promise.resolve({ error: null }); },
        select() { return { order() { return { limit() { return Promise.resolve({ data: [], error: null }); } }; } }; },
      };
    },
  };
  return { db, inserts };
}

test("percentile95 picks the 95th percentile latency", () => {
  assert.equal(percentile95([10, 20, 30, 40, 100]), 100);
  assert.equal(percentile95([]), null);
});

test("shanghaiDayKey converts to Asia/Shanghai calendar day", () => {
  assert.equal(shanghaiDayKey("2026-08-04T16:30:00.000Z"), "2026-08-05");
});

test("buildDaySeries fills missing days with zero", () => {
  const days = enumerateDays(3);
  const series = buildDaySeries(days, [
    { metric: "vision_success", value: 2, created_at: `${days[days.length - 1]}T04:00:00.000Z` },
  ], ["vision_success"]);
  assert.equal(series.length, 3);
  assert.equal(series[series.length - 1].value, 2);
});

test("recordMetric swallows insert failures", async () => {
  const db = {
    from() {
      return {
        insert() {
          return Promise.reject(new Error("write failed"));
        },
      };
    },
  };
  const service = createObservabilityService({ db });
  await assert.doesNotReject(() => service.recordMetric("vision_success", 1, { userId: "user-1" }));
});

test("startTrace generates a server trace id and ignores client trace overrides", async () => {
  const { db } = createDb();
  const service = createObservabilityService({ db });
  const trace = service.startTrace({ traceId: "client-controlled", feature: "vision" });

  assert.match(trace.traceId, /^trace_[0-9a-f-]{36}$/);
  assert.notEqual(trace.traceId, "client-controlled");
  assert.equal(trace.status, "running");
  assert.equal(trace.lastStage, null);
});

test("finishTrace persists a fixed trace payload and swallows observability failures", async () => {
  const { db, inserts } = createDb();
  const service = createObservabilityService({ db });
  const trace = service.startTrace({ feature: "vision", clientRequestId: "client-1" });
  service.recordStage(trace, {
    name: "vision.model",
    durationMs: 4261,
    status: "succeeded",
    provider: "qwen",
    rawResponse: "must not persist",
  });

  await assert.doesNotReject(() => service.finishTrace(trace, {
    status: "succeeded",
    httpStatus: 200,
    provider: "qwen",
    meta: { prompt: "must not persist", fallbackUsed: false },
  }));

  const insert = inserts.find((item) => item.table === "ops_request_traces");
  assert.ok(insert);
  assert.equal(insert.payload.trace_id, trace.traceId);
  assert.equal(insert.payload.status, "succeeded");
  assert.equal(insert.payload.last_stage, "vision.model");
  assert.equal(insert.payload.stages_json[0].name, "vision.model");
  assert.equal(insert.payload.meta_json.prompt, undefined);
});

test("finishTrace returns when the observability database write hangs", async () => {
  const service = createObservabilityService({
    db: {
      from() {
        return { insert: () => new Promise(() => {}) };
      },
    },
  });
  const trace = service.startTrace({ feature: "coach" });
  const startedAt = Date.now();

  const result = await service.finishTrace(trace, { status: "succeeded", httpStatus: 200 });

  assert.equal(result.recorded, false);
  assert.ok(Date.now() - startedAt < 500);
});

test("recordAdminAudit rejects when the audit insert fails", async () => {
  const service = createObservabilityService({
    db: {
      from() {
        return { insert: () => Promise.reject(new Error("audit unavailable")) };
      },
    },
  });

  await assert.rejects(
    () => service.recordAdminAudit({ action: "food.archive", resourceType: "food", resourceId: "food-1" }),
    /audit unavailable/,
  );
});

test("listTraces applies bounded filters and returns a paginated safe projection", async () => {
  const calls = [];
  const rows = [{
    trace_id: "trace_1",
    client_request_id: "client_1",
    user_hash: "user_hash",
    feature: "vision",
    status: "timed_out",
    last_stage: "nutrition.enrichment",
    started_at: "2026-08-15T00:00:00.000Z",
    completed_at: null,
    duration_ms: 1000,
    http_status: 504,
    error_code: "NUTRITION_TIMEOUT",
    provider: "qwen",
    fallback_used: true,
    prompt: "must not persist",
  }];
  const db = {
    from(table) {
      assert.equal(table, "ops_request_traces");
      const state = {};
      const chain = {
        eq(column, value) { calls.push(["eq", column, value]); return chain; },
        gte(column, value) { calls.push(["gte", column, value]); return chain; },
        lte(column, value) { calls.push(["lte", column, value]); return chain; },
        order(column, options) { calls.push(["order", column, options]); return chain; },
        range(from, to) { calls.push(["range", from, to]); return Promise.resolve({ data: rows, count: 41, error: null }); },
        then(resolve, reject) { return Promise.resolve({ data: rows, count: 41, error: null }).then(resolve, reject); },
      };
      return { select(columns, options) { state.columns = columns; state.options = options; return chain; } };
    },
  };
  const service = createObservabilityService({ db });
  const result = await service.listTraces({
    traceId: "trace_1",
    userHash: "user_hash",
    feature: "vision",
    status: "timed_out",
    errorCode: "NUTRITION_TIMEOUT",
    from: "2026-08-14T00:00:00.000Z",
    to: "2026-08-15T00:00:00.000Z",
    page: 2,
    limit: 9999,
  });
  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 200);
  assert.equal(result.total, 41);
  assert.deepEqual(result.items[0], {
    traceId: "trace_1",
    clientRequestId: "client_1",
    userHash: "user_hash",
    feature: "vision",
    status: "timed_out",
    lastStage: "nutrition.enrichment",
    startedAt: "2026-08-15T00:00:00.000Z",
    completedAt: null,
    durationMs: 1000,
    httpStatus: 504,
    errorCode: "NUTRITION_TIMEOUT",
    provider: "qwen",
    fallbackUsed: true,
    expiresAt: null,
  });
  assert.deepEqual(calls.at(-1), ["range", 200, 399]);
});

test("getTraceDetail returns only sanitized stage and meta fields", async () => {
  const db = {
    from(table) {
      assert.equal(table, "ops_request_traces");
      const chain = {
        eq() { return chain; },
        maybeSingle() {
          return Promise.resolve({
            data: {
              trace_id: "trace_1",
              status: "succeeded",
              feature: "coach",
              stages_json: [{ name: "coach.model", status: "succeeded", prompt: "secret" }],
              meta_json: { provider: "deepseek", rawResponse: "secret", fallbackUsed: true },
            },
            error: null,
          });
        },
      };
      return { select() { return chain; } };
    },
  };
  const service = createObservabilityService({ db });
  const result = await service.getTraceDetail("trace_1");
  assert.deepEqual(result.stages, [{ name: "coach.model", status: "succeeded" }]);
  assert.deepEqual(result.meta, { provider: "deepseek", fallbackUsed: true });
  assert.equal(result.meta.rawResponse, undefined);
});

test("listAuditLogs returns bounded filters and sanitized snapshots", async () => {
  const calls = [];
  const db = {
    from(table) {
      assert.equal(table, "admin_audit_logs");
      const chain = {
        eq(column, value) { calls.push(["eq", column, value]); return chain; },
        gte(column, value) { calls.push(["gte", column, value]); return chain; },
        lte(column, value) { calls.push(["lte", column, value]); return chain; },
        order() { return chain; },
        range(from, to) {
          calls.push(["range", from, to]);
          return Promise.resolve({ count: 1, error: null, data: [{
            id: "audit-1",
            action: "food.archive",
            resource_type: "food",
            result: "succeeded",
            before_snapshot: { name: "鸡蛋", prompt: "secret" },
            after_snapshot: { isActive: false, token: "secret" },
          }] });
        },
      };
      return { select() { return chain; } };
    },
  };
  const service = createObservabilityService({ db });
  const result = await service.listAuditLogs({ action: "food.archive", page: 2, limit: 9999 });
  assert.equal(result.pageSize, 200);
  assert.deepEqual(result.items[0].before, { name: "鸡蛋" });
  assert.deepEqual(result.items[0].after, { isActive: false });
  assert.deepEqual(calls.at(-1), ["range", 200, 399]);
});

test("getOverview aggregates vision, rate limit, cancel, and coach metrics", async () => {
  const minutesAgo = (minutes) => new Date(Date.now() - minutes * 60 * 1000).toISOString();
  const metrics = [
    { metric: "vision_success", value: 3, created_at: minutesAgo(8) },
    { metric: "vision_failure", value: 1, created_at: minutesAgo(7) },
    { metric: "vision_latency_ms", value: 100, created_at: minutesAgo(8) },
    { metric: "vision_latency_ms", value: 500, created_at: minutesAgo(7) },
    { metric: "rate_limited", value: 2, created_at: minutesAgo(6) },
    { metric: "account_cancel_success", value: 1, created_at: minutesAgo(5) },
    { metric: "coach_message", value: 4, created_at: minutesAgo(4) },
    { metric: "coach_limited", value: 1, created_at: minutesAgo(3) },
  ];
  const { db } = createDb({ metrics });
  const service = createObservabilityService({ db });
  const overview = await service.getOverview({ hours: 24 });

  assert.equal(overview.windowHours, 24);
  assert.equal(overview.vision.success, 3);
  assert.equal(overview.vision.failure, 1);
  assert.equal(overview.vision.failureRate, 0.25);
  assert.equal(overview.vision.p95Ms, 500);
  assert.equal(overview.rateLimited, 2);
  assert.deepEqual(overview.accountCancel, { succeeded: 1, failed: 0 });
  assert.deepEqual(overview.coach, { messages: 4, limited: 1 });
  assert.equal(overview.foodImage, null);
});

test("getUsageReport returns feature totals and daily series", async () => {
  const today = shanghaiDayKey(new Date().toISOString());
  // Midday Shanghai (= 04:00Z) stays on the same calendar day.
  const createdAt = `${today}T04:00:00.000Z`;
  const metrics = [
    { metric: "vision_success", value: 2, created_at: createdAt },
    { metric: "coach_message", value: 5, created_at: createdAt },
    { metric: "rate_limited", value: 1, created_at: createdAt },
  ];
  const { db } = createDb({ metrics });
  const service = createObservabilityService({ db });
  const report = await service.getUsageReport({ days: 7 });
  assert.equal(report.days, 7);
  assert.equal(report.today, today);
  const vision = report.features.find((item) => item.key === "vision");
  assert.equal(vision.total, 2);
  assert.equal(vision.windowTotal, 2);
  assert.equal(vision.today, 2);
  assert.equal(report.series.length, 7);
  assert.equal(report.series[report.series.length - 1].vision, 2);
  assert.equal(report.series[report.series.length - 1].coach, 5);
});

test("getModelDetail attributes legacy metric rows by catalog feature", async () => {
  const today = shanghaiDayKey(new Date().toISOString());
  const createdAt = `${today}T04:00:00.000Z`;
  const metrics = [
    { metric: "coach_message", value: 4, meta: {}, created_at: createdAt },
  ];
  const { db } = createDb({ metrics });
  const service = createObservabilityService({ db });
  const detail = await service.getModelDetail({
    model: "deepseek-v4-flash",
    days: 7,
    catalog: [{ feature: "coach", featureLabel: "营养教练", model: "deepseek-v4-flash", provider: "deepseek" }],
  });
  assert.equal(detail.requests.today, 4);
  assert.equal(detail.requests.total, 4);
});

test("getModelDetail marks food image tokens as not applicable", async () => {
  const { db } = createDb({ metrics: [] });
  const service = createObservabilityService({ db });
  const detail = await service.getModelDetail({
    model: "HY-Image-3.0-Plus-4090-Tob-v1.0",
    days: 7,
    catalog: [{ feature: "food_image", featureLabel: "食材生图", model: "HY-Image-3.0-Plus-4090-Tob-v1.0", provider: "hunyuan" }],
  });
  assert.equal(detail.tokens.applicable, false);
});

test("getModelDetail includes model_request and token metrics for hunyuan text", async () => {
  const today = shanghaiDayKey(new Date().toISOString());
  const createdAt = `${today}T04:00:00.000Z`;
  const metrics = [
    { metric: "model_request", value: 1, meta: { model: "hunyuan-2.0-instruct-20251111", feature: "daily_tip", provider: "hunyuan" }, created_at: createdAt },
    { metric: "model_tokens", value: 42, meta: { model: "hunyuan-2.0-instruct-20251111", feature: "daily_tip", provider: "hunyuan" }, created_at: createdAt },
    { metric: "model_tokens_input", value: 30, meta: { model: "hunyuan-2.0-instruct-20251111", feature: "daily_tip", provider: "hunyuan" }, created_at: createdAt },
    { metric: "model_tokens_output", value: 12, meta: { model: "hunyuan-2.0-instruct-20251111", feature: "daily_tip", provider: "hunyuan" }, created_at: createdAt },
  ];
  const { db } = createDb({ metrics });
  const service = createObservabilityService({ db });
  const detail = await service.getModelDetail({
    model: "hunyuan-2.0-instruct-20251111",
    days: 7,
    catalog: [{ feature: "daily_tip", featureLabel: "每日小贴士", model: "hunyuan-2.0-instruct-20251111", provider: "hunyuan" }],
  });
  assert.equal(detail.tokens.applicable, true);
  assert.equal(detail.requests.today, 1);
  assert.equal(detail.tokens.today, 42);
  assert.equal(detail.tokens.tracked, true);
});

test("getModelBoard returns one board per unique model", async () => {
  const { db } = createDb({ metrics: [] });
  const service = createObservabilityService({ db });
  const board = await service.getModelBoard({
    days: 7,
    catalog: [
      { feature: "coach", model: "deepseek-v4-flash", provider: "deepseek" },
      { feature: "daily_insight", model: "deepseek-v4-flash", provider: "deepseek" },
      { feature: "weekly_review", model: "deepseek-v4-pro", provider: "deepseek" },
    ],
    foodImageSeries: [],
  });
  assert.equal(board.models.length, 2);
  assert.equal(board.models[0].model, "deepseek-v4-flash");
  assert.equal(board.models[1].model, "deepseek-v4-pro");
});

test("recordDeletion and listDeletionLog persist durable audit rows", async () => {
  const { db, inserts } = createDb();
  const service = createObservabilityService({ db });

  await service.recordDeletion({
    userId: "11111111-1111-4111-8111-111111111111",
    clientRequestId: "22222222-2222-4222-8222-222222222222",
    outcome: "started",
  });
  await service.recordDeletion({
    userId: "11111111-1111-4111-8111-111111111111",
    clientRequestId: "22222222-2222-4222-8222-222222222222",
    outcome: "succeeded",
  });

  assert.equal(inserts.length, 2);
  assert.equal(inserts[0].payload.outcome, "started");
  const rows = await service.listDeletionLog({ limit: 10 });
  assert.equal(rows.length, 2);
  assert.equal(rows[0].outcome, "succeeded");
});

test("purgeExpiredDeletionLogs removes only audit records whose retention has elapsed", async () => {
  const calls = [];
  const service = createObservabilityService({
    db: {
      from(table) {
        assert.equal(table, "ops_account_deletion_log");
        return {
          delete() {
            return {
              lt(column, value) {
                calls.push([column, value]);
                return Promise.resolve({ data: [{ id: "expired-log" }], error: null });
              },
            };
          },
        };
      },
    },
  });

  const result = await service.purgeExpiredDeletionLogs({ now: new Date("2026-08-06T00:00:00.000Z") });
  assert.deepEqual(result, { deleted: 1 });
  assert.deepEqual(calls, [["expires_at", "2026-08-06T00:00:00.000Z"]]);
});
