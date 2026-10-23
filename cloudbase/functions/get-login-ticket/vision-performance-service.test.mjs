import assert from "node:assert/strict";
import test from "node:test";
import { summarizeVisionPerformance } from "./vision-performance-service.cjs";
test("performance separates submit/poll, counts terminal outcomes, and excludes absent historic timings", () => {
  const r = summarizeVisionPerformance({
    requests: [
      {
        http_status: 202,
        duration_ms: 2000,
        meta_json: { method: "POST", route: "/vision-analysis" },
      },
      {
        http_status: 200,
        duration_ms: 100,
        meta_json: { method: "GET", route: "/vision-analysis/id" },
      },
    ],
    tasks: [
      {
        status: "completed",
        created_at: "2026-10-23T00:00:00Z",
        completed_at: "2026-10-23T00:00:20Z",
        raw_recognition: {
          fallbackUsed: true,
          attempts: [
            { provider: "a", model: "m", status: "failed", durationMs: 5000 },
            {
              provider: "b",
              model: "n",
              status: "succeeded",
              durationMs: 7000,
            },
          ],
        },
      },
      { status: "timed_out" },
      { status: "analyzing" },
    ],
    stages: [
      {
        meta: {
          stage: "worker.nutrition",
          status: "succeeded",
          durationMs: 100,
        },
      },
      { meta: { stage: "worker.nutrition", status: "succeeded" } },
    ],
  });
  assert.equal(r.requests.submit.p50Ms, 2000);
  assert.equal(r.requests.poll.p50Ms, 100);
  assert.equal(r.tasks.terminalSuccessRate, 0.5);
  assert.equal(r.tasks.pending, 1);
  assert.equal(r.tasks.duration.p95Ms, 20000);
  assert.equal(r.tasks.fallbackRate, 1);
  assert.equal(r.stages["worker.nutrition"].count, 1);
  assert.equal(r.models["a/m"].successRate, 0);
});
test("no observations do not become zero latency or perfect success", () => {
  const r = summarizeVisionPerformance({});
  assert.equal(r.tasks.terminalSuccessRate, null);
  assert.equal(r.tasks.duration.p95Ms, null);
  assert.equal(r.tasks.fallbackRate, null);
});

test("queue/startup timing correlates accepted submission with the earliest worker start", () => {
  const r = summarizeVisionPerformance({
    requests: [
      {
        started_at: "2026-10-23T00:00:00Z",
        duration_ms: 2000,
        http_status: 202,
        meta_json: {
          method: "POST",
          route: "/vision-analysis",
          analysisId: "a",
        },
        stages_json: [{ name: "upload", status: "succeeded", durationMs: 300 }],
      },
    ],
    stages: [
      {
        meta: {
          stage: "worker.claim",
          status: "succeeded",
          analysisId: "a",
          startedAt: "2026-10-23T00:00:05Z",
        },
      },
    ],
  });
  assert.equal(r.queueAndWorkerStartup.p50Ms, 3000);
  assert.equal(r.stages["api.upload"].p50Ms, 300);
});

test("report pages bounded sources and withholds statistics when coverage is truncated", async () => {
  const { createVisionPerformanceService } = await import("./vision-performance-service.cjs");
  const ranges = [];
  const db = { from(table) {
    const q = {
      select() { return q; }, gte() { return q; }, lte() { return q; },
      eq() { return q; }, in() { return q; }, order() { return q; },
      async range(start, end) {
        ranges.push({table, start, end});
        return {data: table === "ops_request_traces" ? Array.from({length:1000}, () => ({})) : []};
      },
    };
    return q;
  }};
  const report = await createVisionPerformanceService({db, now: () => new Date("2026-10-23T00:00:00Z")}).getReport();
  assert.equal(report.coverage.complete, false);
  assert.equal(report.coverage.requests, 10000);
  assert.equal(report.statistics, null);
  assert.equal(ranges.filter(r => r.table === "ops_request_traces").length, 10);
  assert.equal(Math.max(...ranges.map(r => r.end)), 9999);
});
