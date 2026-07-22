import assert from "node:assert/strict";
import test from "node:test";

import { createCoachDataService } from "./coach-data-service.cjs";

const validRequest = {
  clientRequestId: "11111111-1111-4111-8111-111111111111",
  prompt: "晚餐怎么补蛋白？",
  date: "2026-07-20",
};
const validReply = {
  priority: "protein",
  headline: "晚餐优先补充优质蛋白",
  actions: [{ label: "优先", detail: "鸡胸肉约一掌心，搭配半碗主食和蔬菜。" }],
  rationale: "当前记录显示蛋白质仍有缺口。",
  safety: "none",
};

function createDb() {
  const inserts = [];
  const rows = {
    coach_conversations: [{ id: "conversation-1", user_id: "user-1", archived_at: null }],
    coach_messages: [],
  };
  const db = {
    from(table) {
      let selectedRows = rows[table] ?? [];
      const chain = {
        eq(column, value) { selectedRows = selectedRows.filter((row) => row[column] === value); return chain; },
        is(column, value) { selectedRows = selectedRows.filter((row) => row[column] === value); return chain; },
        order(column, { ascending = true } = {}) {
          selectedRows = [...selectedRows].sort((left, right) => String(left[column]).localeCompare(String(right[column])) * (ascending ? 1 : -1));
          return chain;
        },
        limit(count) { selectedRows = selectedRows.slice(0, count); return chain; },
        select() { return chain; },
        maybeSingle: async () => ({ data: selectedRows[0] ?? null, error: null }),
        then(resolve) { return Promise.resolve({ data: selectedRows, error: null }).then(resolve); },
      };
      return {
        select() { return chain; },
        insert(payload) {
          const values = Array.isArray(payload) ? payload : [payload];
          const created = values.map((value, index) => ({ id: `${table}-${inserts.length + index + 1}`, created_at: `2026-07-20T10:00:0${inserts.length + index}.000Z`, ...value }));
          rows[table].push(...created);
          inserts.push(...created.map((value) => ({ table, payload: value })));
          return { select: () => ({ single: async () => ({ data: created[0], error: null }) }) };
        },
      };
    },
  };
  return { db, inserts };
}

function dependencies(overrides = {}) {
  return {
    getDailySummary: async () => ({
      targets: { calories: 2400, protein: 150, carbs: 280, fat: 70 },
      consumed: { calories: 1700, protein: 110, carbs: 190, fat: 45 },
      remaining: { calories: 700, protein: 40, carbs: 90, fat: 25 },
      completion: 72,
      meals: [{ id: "meal-1" }],
    }),
    getWeeklyReview: async () => ({ recordedDays: 5, proteinCompletion: 83, score: 79 }),
    getAccount: async () => ({ goalType: "muscle_gain", settings: { dietaryPattern: "均衡饮食", foodAvoidances: ["花生"] } }),
    ...overrides,
  };
}

test("builds model context from server summaries and reviews only", async () => {
  const answerCalls = [];
  const { db } = createDb();
  const service = createCoachDataService({
    db,
    ...dependencies(),
    answer: async (input) => { answerCalls.push(input); return validReply; },
  });

  await service.sendMessage("user-1", validRequest);

  assert.deepEqual(answerCalls[0].context.weekly, { recordedDays: 5, proteinCompletion: 83, score: 79 });
  assert.deepEqual(answerCalls[0].context.preferences, { dietaryPattern: "均衡饮食", foodAvoidances: ["花生"] });
  assert.equal(answerCalls[0].context.userId, undefined);
  assert.equal(answerCalls[0].context.daily.mealCount, 1);
});

test("stores a rule_v2 structured fallback when DeepSeek fails", async () => {
  const { db, inserts } = createDb();
  const service = createCoachDataService({ db, ...dependencies(), answer: async () => { throw new Error("upstream"); } });

  const result = await service.sendMessage("user-1", validRequest);

  assert.equal(result.reply.source, "rule_v2");
  assert.equal(inserts.at(-1).payload.provider, "rule_v2");
  assert.equal(inserts.at(-1).payload.answer.priority, "protein");
  assert.match(result.messages[1].content, /40g 蛋白质/);
});

test("does not call the model again for the same client request id", async () => {
  const { db } = createDb();
  let calls = 0;
  const service = createCoachDataService({
    db,
    ...dependencies(),
    answer: async () => { calls += 1; return validReply; },
  });

  const first = await service.sendMessage("user-1", validRequest);
  const second = await service.sendMessage("user-1", validRequest);

  assert.equal(calls, 1);
  assert.equal(second.reply.source, "deepseek");
  assert.deepEqual(second.reply, first.reply);
});

test("uses a fixed consultation response instead of calling the model for medical risk", async () => {
  const { db } = createDb();
  let calls = 0;
  const service = createCoachDataService({ db, ...dependencies(), answer: async () => { calls += 1; return validReply; } });

  const result = await service.sendMessage("user-1", { ...validRequest, clientRequestId: "22222222-2222-4222-8222-222222222222", prompt: "我在吃药，今天要怎么减脂？" });

  assert.equal(calls, 0);
  assert.equal(result.reply.safety, "professional_consultation");
  assert.equal(result.reply.source, "rule_v2");
});

test("keeps unrelated questions inside the nutrition-coach boundary without calling the model", async () => {
  const { db } = createDb();
  let calls = 0;
  const service = createCoachDataService({ db, ...dependencies(), answer: async () => { calls += 1; return validReply; } });

  const result = await service.sendMessage("user-1", { ...validRequest, clientRequestId: "33333333-3333-4333-8333-333333333333", prompt: "帮我写一首诗" });

  assert.equal(calls, 0);
  assert.equal(result.reply.source, "rule_v2");
  assert.match(result.messages[1].content, /营养、饮食、食谱或训练恢复/);
});

test("returns a non-generative coach brief from authoritative context", async () => {
  const { db } = createDb();
  const service = createCoachDataService({ db, ...dependencies(), answer: null });

  const brief = await service.getBrief("user-1", "2026-07-20");

  assert.equal(brief.priority, "protein");
  assert.deepEqual(brief.quickPrompts, ["晚餐怎么补蛋白？", "查看今日进度"]);
  assert.equal(brief.remaining.protein, 40);
});
