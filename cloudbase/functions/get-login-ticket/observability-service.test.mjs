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

test("getOverview aggregates vision, rate limit, cancel, and coach metrics", async () => {
  const metrics = [
    { metric: "vision_success", value: 3, created_at: "2026-08-05T10:00:00.000Z" },
    { metric: "vision_failure", value: 1, created_at: "2026-08-05T10:01:00.000Z" },
    { metric: "vision_latency_ms", value: 100, created_at: "2026-08-05T10:00:00.000Z" },
    { metric: "vision_latency_ms", value: 500, created_at: "2026-08-05T10:01:00.000Z" },
    { metric: "rate_limited", value: 2, created_at: "2026-08-05T10:02:00.000Z" },
    { metric: "account_cancel_success", value: 1, created_at: "2026-08-05T10:03:00.000Z" },
    { metric: "coach_message", value: 4, created_at: "2026-08-05T10:04:00.000Z" },
    { metric: "coach_limited", value: 1, created_at: "2026-08-05T10:05:00.000Z" },
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
