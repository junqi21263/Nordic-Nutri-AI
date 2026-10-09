import assert from "node:assert/strict";
import test from "node:test";

import { createVerificationCenterService } from "./verification-center-service.cjs";

function createDb(rows) {
  return {
    from() {
      const state = { filters: [] };
      const query = {
        select() { return query; },
        order() { return query; },
        range() { return query; },
        eq(field, value) { state.filters.push([field, value]); return query; },
        async maybeSingle() {
          const id = state.filters.find(([field]) => field === "id")?.[1];
          return { data: rows.find((row) => row.id === id) ?? null, error: null };
        },
        then(resolve) {
          const data = rows.filter((row) => state.filters.every(([field, value]) => row[field] === value));
          return Promise.resolve({ data, count: data.length, error: null }).then(resolve);
        },
      };
      return query;
    },
  };
}

test("verification center masks target and never returns stored OTP material", async () => {
  const rows = [{
    id: "verification-1",
    target: "hashed-target",
    target_value: "user@example.com",
    target_type: "email",
    purpose: "register",
    status: "sent",
    code_hash: "never-return-this",
    created_at: "2026-09-06T01:00:00.000Z",
    sent_at: "2026-09-06T01:00:01.000Z",
    expires_at: "2026-09-06T01:10:00.000Z",
    used_at: null,
    attempt_count: 0,
    send_attempt_count: 1,
    provider: "brevo",
    provider_message_id: "message-1",
    provider_delivery_status: "accepted",
    provider_http_status: 202,
    trace_id: "trace_1",
  }];
  const service = createVerificationCenterService({ db: createDb(rows), isAdmin: async () => true });
  const result = await service.list("admin-1");
  assert.equal(result.items[0].target, "u***@example.com");
  assert.equal(result.items[0].providerMessageId, "message-1");
  assert.equal(result.items[0].providerHttpStatus, 202);
  assert.equal(result.items[0].traceId, "trace_1");
  assert.equal("code" in result.items[0], false);
  assert.equal("codeHash" in result.items[0], false);
});

test("verification center records failed admin resends without sensitive fields", async () => {
  const auditRecords = [];
  const service = createVerificationCenterService({
    db: createDb([]),
    isAdmin: async () => true,
    auth: { resendVerificationCode: async () => { throw Object.assign(new Error("provider failed"), { code: "AUTH_PROVIDER_UNAVAILABLE" }); } },
    audit: { record: async (record) => { auditRecords.push(record); } },
  });
  await assert.rejects(() => service.resend("admin-1", "verification-1", { traceId: "trace-failed" }), { code: "AUTH_PROVIDER_UNAVAILABLE" });
  assert.equal(auditRecords[0].result, "failed");
  assert.equal(auditRecords[0].resourceId, "verification-1");
  assert.equal(auditRecords[0].traceId, "trace-failed");
  assert.equal("code" in auditRecords[0].after, false);
});
