import assert from "node:assert/strict";
import test from "node:test";
import { createJobOpsService, JOB_CATALOG, JobOpsError } from "./job-ops-service.cjs";

test("job catalog keeps configured state separate from runtime binding", async () => {
  const service = createJobOpsService({ observability: { listJobRuns: async () => ({ items: [] }) } });
  const result = await service.listJobs();
  assert.equal(result.items.length, 5);
  assert.equal(result.items.find((job) => job.key === "food_image_worker").configured, true);
  assert.equal(result.items.find((job) => job.key === "food_image_worker").runtimeBindingStatus, "unknown");
  assert.equal(JOB_CATALOG.find((job) => job.key === "quota_reset").manualAllowed, false);
});

test("runNow rejects arbitrary or unsupported job keys before execution", async () => {
  let executed = false;
  const service = createJobOpsService({
    adminAudit: { record: async () => {} },
    foodImageBatches: { dispatchTrusted: async () => { executed = true; } },
  });
  await assert.rejects(() => service.runNow("shell_command", { actorUserId: "admin-1" }), (error) => error.code === "JOB_NOT_ALLOWED");
  await assert.rejects(() => service.runNow("quota_reset", { actorUserId: "admin-1" }), (error) => error.code === "JOB_NOT_ALLOWED");
  assert.equal(executed, false);
});

test("runNow audits before using the trusted executor and records both run states", async () => {
  const events = [];
  const service = createJobOpsService({
    adminAudit: { record: async () => { events.push("audit"); } },
    observability: { recordJobRun: async (input) => { events.push(input.status); } },
    foodImageBatches: { dispatchTrusted: async () => { events.push("executor"); return { processed: 3 }; } },
  });
  const result = await service.runNow("food_image_worker", { actorUserId: "admin-1", traceId: "trace-1" });
  assert.equal(result.result.processed, 3);
  assert.deepEqual(events, ["audit", "running", "executor", "succeeded"]);
});

test("audit failure prevents runNow from starting the business job", async () => {
  let executed = false;
  const service = createJobOpsService({
    adminAudit: { record: async () => { throw new Error("audit down"); } },
    foodImageBatches: { dispatchTrusted: async () => { executed = true; } },
  });
  await assert.rejects(() => service.runNow("food_image_worker", { actorUserId: "admin-1" }), /audit down/);
  assert.equal(executed, false);
});

test("finish job run failure does not invoke the executor twice", async () => {
  let executions = 0;
  const statuses = [];
  const service = createJobOpsService({
    adminAudit: { record: async () => {} },
    observability: { recordJobRun: async (input) => { statuses.push(input.status); if (input.status === "succeeded") throw new Error("metrics down"); } },
    foodImageBatches: { dispatchTrusted: async () => { executions += 1; return { processed: 1 }; } },
  });
  const result = await service.runNow("food_image_worker", { actorUserId: "admin-1" });
  assert.equal(result.result.processed, 1);
  assert.equal(executions, 1);
  assert.deepEqual(statuses, ["running", "succeeded"]);
});

