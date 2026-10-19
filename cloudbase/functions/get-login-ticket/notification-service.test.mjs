import test from "node:test";
import assert from "node:assert/strict";
import service from "./notification-service.cjs";
const { announcementInput, createNotificationService } = service;
const input = {
  title: "维护",
  summary: "说明",
  body: "正文",
  audience: "all",
  pushEnabled: false,
};
test("announcement rejects missing recipients, arbitrary IDs and oversized copy", () => {
  assert.equal(announcementInput(input).title, "维护");
  for (const value of [
    { ...input, title: "x".repeat(81) },
    { ...input, audience: "selected", recipientIds: [] },
    { ...input, audience: "selected", recipientIds: ["invalid"] },
    { ...input, pushEnabled: "true" },
  ])
    assert.throws(() => announcementInput(value));
});
test("admin authorization precedes all writes", async () => {
  const s = createNotificationService({ db: {}, isAdmin: async () => false });
  await assert.rejects(s.save("user", null, input), { code: "FORBIDDEN" });
  await assert.rejects(s.act("user", "bad", "publish"), { code: "FORBIDDEN" });
});
test("notification detail scopes read to authenticated owner and rejects missing row", async () => {
  const filters = [];
  const q = {
    select() {
      return this;
    },
    eq(k, v) {
      filters.push([k, v]);
      return this;
    },
    is() {
      return this;
    },
    async maybeSingle() {
      return { data: null };
    },
  };
  const s = createNotificationService({
    db: {
      from() {
        return q;
      },
    },
  });
  await assert.rejects(
    s.detail("owner", "11111111-1111-4111-8111-111111111111"),
    { code: "NOTIFICATION_NOT_FOUND" },
  );
  assert.deepEqual(filters, [
    ["id", "11111111-1111-4111-8111-111111111111"],
    ["user_id", "owner"],
  ]);
});
test("push failure retains durable message and schedules retry", async () => {
  const updates = [];
  const row = {
    id: "n",
    user_id: "u",
    kind: "feedback",
    push_attempts: 1,
    push_generation: 0,
  };
  const db = {
    async rpc() {
      return { data: [row] };
    },
    from(table) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        async single() {
          return { data: { push_status: "sending" } };
        },
        async maybeSingle() {
          return { data: null };
        },
        update(patch) {
          updates.push(patch);
          return this;
        },
        then(resolve) {
          resolve({ data: [] });
        },
      };
    },
  };
  const s = createNotificationService({
    db,
    push: {
      async sendNotification() {
        throw Object.assign(new Error(), { code: "FCM_TIMEOUT" });
      },
    },
  });
  const result = await s.dispatch();
  assert.equal(result.items[0].status, "pending");
  assert.equal(updates[0].push_error, "FCM_TIMEOUT");
  assert.ok(updates[0].next_attempt_at);
});

test("RPC false scalar rows do not mark a foreign message read", async () => {
  for (const data of [
    false,
    [{ mark_notification_read: false }],
    { mark_notification_read: false },
  ]) {
    const s = createNotificationService({
      db: {
        async rpc() {
          return { data };
        },
      },
    });
    await assert.rejects(
      s.read("other", "11111111-1111-4111-8111-111111111111"),
      { code: "NOTIFICATION_NOT_FOUND" },
    );
  }
  const s = createNotificationService({
    db: {
      async rpc() {
        return { data: [{ mark_notification_read: true }] };
      },
    },
  });
  assert.deepEqual(
    await s.read("owner", "11111111-1111-4111-8111-111111111111"),
    { read: true },
  );
});

test("malformed request bodies and pagination fail before database access", async () => {
 for(const input of [null,undefined,[]]) assert.throws(()=>announcementInput(input),{code:"ANNOUNCEMENT_CONTENT_INVALID"});
 const s=createNotificationService({db:{}});
 for(const offset of [-1,1.5,Infinity,"bad"]) await assert.rejects(s.list("owner",{offset}),{code:"NOTIFICATION_OFFSET_INVALID"});
 await assert.rejects(s.preferences("owner",null),{code:"NOTIFICATION_PREFERENCES_INVALID"});
});
