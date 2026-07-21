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
