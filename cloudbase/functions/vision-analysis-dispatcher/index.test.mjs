import assert from "node:assert/strict";
import test from "node:test";

import { createCloudbaseWorkerInvoker, dispatchOnce, main, makeSignature } from "./index.js";

test("main skips before any dispatch work when the feature is disabled", async () => {
  const result = await main({ enabled: false });
  assert.deepEqual(result, { skipped: true, reason: "feature_disabled" });
});

test("vision dispatcher uses queued-analysis route and HMAC", async () => {
  const calls = [];
  const result = await dispatchOnce({
    endpoint: "https://example.test/get-login-ticket",
    secret: "vision-dispatch-secret",
    maxItems: 4,
    now: () => 1_700_000_000_000,
    request: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, text: async () => JSON.stringify({ claimed: 4 }) };
    },
  });
  assert.deepEqual(result, { claimed: 4, invoked: 0, errors: [] });
  assert.equal(calls[0].url, "https://example.test/get-login-ticket/api/internal/vision-analysis/dispatch");
  assert.equal(calls[0].options.headers["x-vision-dispatch-signature"], makeSignature("vision-dispatch-secret", {
    timestamp: "1700000000",
    path: "/api/internal/vision-analysis/dispatch",
    body: JSON.stringify({ maxItems: 4 }),
  }));
});

test("vision dispatcher rejects missing configuration", async () => {
  await assert.rejects(() => dispatchOnce({ endpoint: "", secret: "" }), /VISION_DISPATCH_CONFIG_MISSING/);
});

test("worker invocation pins the environment and $LATEST qualifier", async () => {
  let initOptions;
  let callOptions;
  let callRequestOptions;
  const sdk = {
    SYMBOL_CURRENT_ENV: Symbol.for("SYMBOL_CURRENT_ENV"),
    init(options) {
      initOptions = options;
      return {
        callFunction(options, requestOptions) {
          callOptions = options;
          callRequestOptions = requestOptions;
          return Promise.resolve({ requestId: "request-1", result: { skipped: true } });
        },
      };
    },
  };
  const invoke = createCloudbaseWorkerInvoker({
    env: { TCB_ENV: "lewis-healthy-d4glgqqzv73a5bc10" },
    cloudbaseNodeSdk: sdk,
  });
  await invoke({ analysisId: "analysis-1", jobId: "job-1", version: 4, leaseUntil: "2026-08-18T10:00:00Z" });
  assert.deepEqual(initOptions, { env: "lewis-healthy-d4glgqqzv73a5bc10" });
  assert.deepEqual(callOptions, {
    name: "vision-analysis-worker",
    qualifier: "$LATEST",
    data: { analysisId: "analysis-1", jobId: "job-1", version: 4, leaseUntil: "2026-08-18T10:00:00Z" },
  });
  assert.equal(callRequestOptions.timeout, 55_000);
});

test("vision dispatcher invokes the worker once for each claimed lease", async () => {
  const invoked = [];
  const result = await dispatchOnce({
    endpoint: "https://example.test/get-login-ticket",
    secret: "vision-dispatch-secret",
    invokeWorker: async (job) => { invoked.push(job); return { ok: true }; },
    request: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        claimed: 2,
        jobs: [
          { id: "analysis-1", job_id: "job-1", version: 4, lease_until: "2026-08-18T10:00:00.000Z" },
          { id: "analysis-2", job_id: "job-2", version: 7, lease_until: "2026-08-18T10:00:00.000Z" },
        ],
      }),
    }),
  });
  assert.equal(result.claimed, 2);
  assert.equal(result.invoked, 2);
  assert.deepEqual(invoked, [
    { analysisId: "analysis-1", jobId: "job-1", version: 4, leaseUntil: "2026-08-18T10:00:00.000Z" },
    { analysisId: "analysis-2", jobId: "job-2", version: 7, leaseUntil: "2026-08-18T10:00:00.000Z" },
  ]);
});

test("vision dispatcher persists invoke correlation stages when a recorder is provided", async () => {
  const events = [];
  await dispatchOnce({
    endpoint: "https://example.test/get-login-ticket",
    secret: "vision-dispatch-secret",
    request: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ claimed: 1, jobs: [{ id: "analysis-1", job_id: "job-1", version: 4, lease_until: "2026-08-18T10:00:00Z" }] }) }),
    recordDiagnostic: async (event) => events.push(event),
    invokeWorker: async () => ({ ok: true }),
  });
  assert.deepEqual(events.map((event) => event.stage), ["dispatcher.claim", "dispatcher.worker_invoke_start", "dispatcher.worker_invoke_result"]);
  assert.equal(events[1].analysisId, "analysis-1");
  assert.equal(events[1].jobId, "job-1");
  assert.equal(events[1].version, 4);
});

test("vision dispatcher does not invoke the worker when claim returns zero jobs", async () => {
  let calls = 0;
  const result = await dispatchOnce({
    endpoint: "https://example.test/get-login-ticket",
    secret: "vision-dispatch-secret",
    invokeWorker: async () => { calls += 1; },
    request: async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ claimed: 0, jobs: [] }) }),
  });
  assert.equal(result.invoked, 0);
  assert.equal(calls, 0);
});

test("vision dispatcher reports worker invocation errors without changing business state", async () => {
  const result = await dispatchOnce({
    endpoint: "https://example.test/get-login-ticket",
    secret: "vision-dispatch-secret",
    invokeWorker: async () => { throw Object.assign(new Error("SDK timeout"), { code: "WORKER_INVOKE_TIMEOUT" }); },
    request: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ claimed: 1, jobs: [{ id: "analysis-1", job_id: "job-1", version: 4 }] }),
    }),
  });
  assert.equal(result.claimed, 1);
  assert.equal(result.invoked, 0);
  assert.deepEqual(result.errors, [{ analysisId: "analysis-1", jobId: "job-1", code: "WORKER_INVOKE_TIMEOUT" }]);
});

test("vision dispatcher deduplicates duplicate job leases in one claim response", async () => {
  let calls = 0;
  const result = await dispatchOnce({
    endpoint: "https://example.test/get-login-ticket",
    secret: "vision-dispatch-secret",
    invokeWorker: async () => { calls += 1; },
    request: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ claimed: 2, jobs: [
        { id: "analysis-1", job_id: "job-1", version: 4 },
        { id: "analysis-1", job_id: "job-1", version: 4 },
      ] }),
    }),
  });
  assert.equal(result.invoked, 1);
  assert.equal(calls, 1);
});

test("vision dispatcher bounds concurrent worker invocations", async () => {
  let active = 0;
  let peak = 0;
  const result = await dispatchOnce({
    endpoint: "https://example.test/get-login-ticket",
    secret: "vision-dispatch-secret",
    invokeConcurrency: 3,
    invokeWorker: async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return { ok: true };
    },
    request: async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        claimed: 5,
        jobs: Array.from({ length: 5 }, (_, index) => ({
          id: `analysis-${index + 1}`,
          job_id: `job-${index + 1}`,
          version: 1,
        })),
      }),
    }),
  });
  assert.equal(result.invoked, 5);
  assert.equal(peak, 3);
});

test("vision dispatcher claims no more jobs than its worker concurrency", async () => {
  let requestBody;
  await dispatchOnce({
    endpoint: "https://example.test/get-login-ticket",
    secret: "vision-dispatch-secret",
    maxItems: 5,
    invokeConcurrency: 3,
    invokeWorker: async () => ({ ok: true }),
    request: async (_url, options) => {
      requestBody = JSON.parse(options.body);
      return { ok: true, status: 200, text: async () => JSON.stringify({ claimed: 0, jobs: [] }) };
    },
  });
  assert.deepEqual(requestBody, { maxItems: 3 });
});
