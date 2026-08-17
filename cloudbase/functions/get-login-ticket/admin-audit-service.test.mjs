import assert from "node:assert/strict";
import test from "node:test";
import {
  AdminAuditError,
  createAdminAuditService,
  sanitizeAuditInput,
  withAdminAuditTransaction,
} from "./admin-audit-service.cjs";

test("sanitizeAuditInput keeps only the shared audit snapshot contract", () => {
  const result = sanitizeAuditInput({
    action: "food.update",
    resourceType: "food",
    before: { name: "鸡蛋", prompt: "secret", imageUrl: "https://secret" },
    after: { status: "published", token: "secret" },
  });
  assert.deepEqual(result.before, { name: "鸡蛋" });
  assert.deepEqual(result.after, { status: "published" });
});

test("atomic audit helper does not run mutation without a transaction boundary", async () => {
  let called = false;
  await assert.rejects(
    () => withAdminAuditTransaction({ mutation: async () => { called = true; } }),
    (error) => error instanceof AdminAuditError && error.code === "ADMIN_AUDIT_TRANSACTION_UNAVAILABLE",
  );
  assert.equal(called, false);
});

test("atomic audit helper commits mutation and audit inside one transaction callback", async () => {
  const events = [];
  const result = await withAdminAuditTransaction({
    transaction: async (callback) => callback({ transaction: true }),
    mutation: async (tx) => { events.push(["mutation", tx.transaction]); return { id: "food-1" }; },
    audit: async (value) => { events.push(["audit", value.id]); },
  });
  assert.deepEqual(result, { id: "food-1" });
  assert.deepEqual(events, [["mutation", true], ["audit", "food-1"]]);
});

test("atomic audit helper propagates audit failure so the transaction can rollback", async () => {
  let rolledBack = false;
  await assert.rejects(
    () => withAdminAuditTransaction({
      transaction: async (callback) => {
        try {
          return await callback({ transaction: true });
        } catch (error) {
          rolledBack = true;
          throw error;
        }
      },
      mutation: async () => ({ id: "food-1" }),
      audit: async () => { throw new Error("audit insert failed"); },
    }),
    /audit insert failed/,
  );
  assert.equal(rolledBack, true);
});

test("external operation returns explicit applied and audit failure state", async () => {
  const service = createAdminAuditService({
    observability: { recordAdminAudit: async () => { throw new Error("audit down"); } },
  });
  const result = await service.recordExternal({ action: "image.regenerate", resourceType: "food", resourceId: "food-1" }, { jobId: "job-1" });
  assert.deepEqual(result, {
    jobId: "job-1",
    operationApplied: true,
    audit: { status: "failed", errorCode: "ADMIN_AUDIT_WRITE_FAILED" },
  });
});

test("atomic RPC fails closed when the database transaction function is unavailable", async () => {
  const service = createAdminAuditService({ observability: { recordAdminAudit: async () => {} } });
  await assert.rejects(
    () => service.runAtomicRpc("admin_food_mutation_with_audit", {}),
    (error) => error.code === "ADMIN_AUDIT_TRANSACTION_UNAVAILABLE",
  );
});

