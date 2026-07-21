import assert from "node:assert/strict";
import test from "node:test";

import { createCoachDataService } from "./coach-data-service.cjs";

function createDb() {
  const inserts = [];
  const rows = {
    coach_conversations: [{ id: "conversation-1", user_id: "user-1", archived_at: null }],
    coach_messages: [],
  };
  const db = {
    from(table) {
      let filters = [];
      let selectedRows = rows[table] ?? [];
      const chain = {
        eq(column, value) { filters.push([column, value]); selectedRows = selectedRows.filter((row) => row[column] === value); return chain; },
        is(column, value) { filters.push([column, value]); selectedRows = selectedRows.filter((row) => row[column] === value); return chain; },
        order() { return chain; },
        limit() { return chain; },
        select() { return chain; },
        maybeSingle: async () => ({ data: selectedRows[0] ?? null, error: null }),
        then(resolve) { return Promise.resolve({ data: selectedRows, error: null }).then(resolve); },
      };
      return {
        select() { return chain; },
        insert(payload) {
          const values = Array.isArray(payload) ? payload : [payload];
          const created = values.map((value, index) => ({ id: `${table}-${inserts.length + index + 1}`, created_at: "2026-07-20T10:00:00.000Z", ...value }));
          rows[table].push(...created);
          inserts.push(...created.map((value) => ({ table, payload: value })));
          return { select: () => ({ single: async () => ({ data: created[0], error: null }) }) };
        },
      };
    },
  };
  return { db, inserts };
}

test("persists user and assistant messages under the authenticated user's conversation", async () => {
  const { db, inserts } = createDb();
  const service = createCoachDataService({
    db,
    getDailySummary: async () => ({ remaining: { protein: 40 }, targets: { calories: 2400 }, consumed: { calories: 1200 } }),
    answer: async () => "晚餐优先安排一份瘦肉。",
  });

  const result = await service.sendMessage("user-1", {
    clientRequestId: "11111111-1111-4111-8111-111111111111",
    prompt: "晚餐怎么吃？",
    date: "2026-07-20",
  });

  assert.equal(result.messages[0].role, "user");
  assert.equal(result.messages[1].role, "assistant");
  assert.deepEqual(inserts.filter((row) => row.table === "coach_messages").map((row) => row.payload.user_id), ["user-1", "user-1"]);
});

test("uses a deterministic nutrition rule when the model is not configured", async () => {
  const { db } = createDb();
  const service = createCoachDataService({
    db,
    getDailySummary: async () => ({ remaining: { protein: 25 }, targets: { calories: 2400 }, consumed: { calories: 1600 } }),
    answer: null,
  });

  const result = await service.sendMessage("user-1", {
    clientRequestId: "22222222-2222-4222-8222-222222222222",
    prompt: "查看今日进度",
    date: "2026-07-20",
  });

  assert.match(result.messages[1].content, /25g 蛋白质/);
  assert.equal(result.messages[1].provider, "rule_v1");
});
