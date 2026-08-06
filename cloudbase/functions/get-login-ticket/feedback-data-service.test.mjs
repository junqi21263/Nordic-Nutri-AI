import assert from "node:assert/strict";
import test from "node:test";

import { createFeedbackDataService } from "./feedback-data-service.cjs";

test("persists bounded feedback under the authenticated product user", async () => {
  const writes = [];
  const db = {
    from(table) {
      return {
        insert(payload) {
          writes.push({ table, payload });
          return { select: () => ({ single: async () => ({ data: { id: "feedback-1", created_at: "2026-07-20T10:00:00Z", ...payload }, error: null }) }) };
        },
      };
    },
  };
  const service = createFeedbackDataService({ db });

  const result = await service.submitFeedback("user-1", {
    clientRequestId: "11111111-1111-4111-8111-111111111111",
    category: "product",
    content: "希望周报增加餐次趋势。",
    deviceContext: { platform: "wechat" },
  });

  assert.equal(result.id, "feedback-1");
  assert.equal(writes[0].table, "user_feedback");
  assert.equal(writes[0].payload.user_id, "user-1");
});

test("rejects empty or oversized feedback before persistence", async () => {
  const service = createFeedbackDataService({ db: { from: () => { throw new Error("must not write"); } } });
  await assert.rejects(() => service.submitFeedback("user-1", { content: "" }), /无效/);
  await assert.rejects(() => service.submitFeedback("user-1", { content: "x".repeat(2001) }), /无效/);
});

test("lists only the current user's feedback with reply read state", async () => {
  const calls = [];
  const db = {
    from(table) {
      const api = {
        select() { return api; },
        eq(column, value) { calls.push(["eq", table, column, value]); return api; },
        order() { return api; },
        limit() { return Promise.resolve({
          data: [{
            id: "11111111-1111-4111-8111-111111111111",
            category: "product",
            content: "希望增加趋势",
            status: "resolved",
            admin_reply: "已加入排期",
            created_at: "2026-08-06T01:00:00Z",
            replied_at: "2026-08-06T02:00:00Z",
            reply_read_at: null,
          }],
          error: null,
        }); },
      };
      return api;
    },
  };
  const service = createFeedbackDataService({ db });

  const result = await service.listFeedbackForUser("user-a");

  assert.deepEqual(calls, [["eq", "user_feedback", "user_id", "user-a"]]);
  assert.equal(result.unreadReplyCount, 1);
  assert.deepEqual(result.items[0], {
    id: "11111111-1111-4111-8111-111111111111",
    category: "product",
    content: "希望增加趋势",
    status: "resolved",
    adminReply: "已加入排期",
    createdAt: "2026-08-06T01:00:00Z",
    repliedAt: "2026-08-06T02:00:00Z",
    replyReadAt: null,
  });
});

test("marks only the current user's unread replies as read", async () => {
  const calls = [];
  const db = {
    from(table) {
      const api = {
        update(payload) { calls.push(["update", table, payload]); return api; },
        eq(column, value) { calls.push(["eq", table, column, value]); return api; },
        in(column, value) { calls.push(["in", table, column, value]); return api; },
        not(column, operator, value) { calls.push(["not", table, column, operator, value]); return api; },
        is(column, value) { calls.push(["is", table, column, value]); return api; },
        select() { return Promise.resolve({ data: [{ id: "11111111-1111-4111-8111-111111111111" }], error: null }); },
      };
      return api;
    },
  };
  const service = createFeedbackDataService({ db });
  const id = "11111111-1111-4111-8111-111111111111";

  const result = await service.markRepliesRead("user-a", [id]);

  assert.equal(result.markedCount, 1);
  assert.deepEqual(calls.slice(1), [
    ["eq", "user_feedback", "user_id", "user-a"],
    ["in", "user_feedback", "id", [id]],
    ["not", "user_feedback", "admin_reply", "is", null],
    ["is", "user_feedback", "reply_read_at", null],
  ]);
});
