import assert from "node:assert/strict";
import test from "node:test";
import { createObservabilityService } from "./observability-service.cjs";

test("recordAdminAudit writes sanitized audit payload", async () => {
  const inserts = [];
  const db = {
    from(table) {
      return {
        insert(payload) {
          inserts.push({ table, payload });
          return Promise.resolve({ data: null, error: null });
        },
      };
    },
  };
  const service = createObservabilityService({ db });
  const result = await service.recordAdminAudit({
    actorUserId: "admin-1",
    action: "food.update",
    resourceType: "food",
    before: { name: "鸡蛋", token: "secret" },
    after: { status: "published", imageUrl: "https://secret" },
    result: "succeeded",
  });
  assert.deepEqual(result, { recorded: true });
  assert.deepEqual(inserts, [{
    table: "admin_audit_logs",
    payload: {
      actor_user_id: "admin-1",
      action: "food.update",
      resource_type: "food",
      resource_id: null,
      before_snapshot: { name: "鸡蛋" },
      after_snapshot: { status: "published" },
      result: "succeeded",
      error_code: null,
      trace_id: null,
    },
  }]);
});
