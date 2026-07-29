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
    coach_messages: [{ id: "old-message", user_id: "user-1", conversation_id: "conversation-1", role: "assistant", content: "历史消息", created_at: "2026-07-20T10:00:00.000Z" }],
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
        update(payload) {
          for (const row of selectedRows) Object.assign(row, payload);
          return chain;
        },
        maybeSingle: async () => ({ data: selectedRows[0] ?? null, error: null }),
        then(resolve) { return Promise.resolve({ data: selectedRows, error: null }).then(resolve); },
      };
      return {
        select() { return chain; },
        update(payload) {
          for (const row of selectedRows) Object.assign(row, payload);
          return chain;
        },
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
  return { db, inserts, rows };
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

test("streams a bounded nutrition reply and persists only after completion", async () => {
  const { db, inserts } = createDb();
  const service = createCoachDataService({
    db,
    ...dependencies(),
    streamAnswer: async function* () {
      yield "晚餐优先";
      yield "安排鸡胸肉和蔬菜。";
    },
  });

  const events = [];
  for await (const event of service.streamMessage("user-1", {
    ...validRequest,
    clientRequestId: "44444444-4444-4444-8444-444444444444",
  })) events.push(event);

  assert.deepEqual(events.map((event) => event.type), ["delta", "complete"]);
  assert.equal(events[0].text, "晚餐优先安排鸡胸肉和蔬菜。");
  assert.equal(events[1].reply.source, "deepseek");
  assert.equal(inserts.filter((entry) => entry.payload.role === "assistant").length, 1);
  assert.match(inserts.at(-1).payload.content, /鸡胸肉和蔬菜/);
});

test("does not invoke the stream model for unrelated questions", async () => {
  const { db } = createDb();
  let calls = 0;
  const service = createCoachDataService({
    db,
    ...dependencies(),
    streamAnswer: async function* () { calls += 1; yield "不应出现"; },
  });

  const events = [];
  for await (const event of service.streamMessage("user-1", {
    ...validRequest,
    clientRequestId: "55555555-5555-4555-8555-555555555555",
    prompt: "帮我写一首诗",
  })) events.push(event);

  assert.equal(calls, 0);
  assert.deepEqual(events.map((event) => event.type), ["complete"]);
  assert.equal(events[0].reply.source, "rule_v2");
});

test("returns record-aware coach quick prompts from authoritative context", async () => {
  const { db } = createDb();
  const service = createCoachDataService({ db, ...dependencies(), answer: null });

  const brief = await service.getBrief("user-1", "2026-07-20");

  assert.equal(brief.priority, "protein");
  assert.deepEqual(brief.quickPrompts, [
    "晚餐怎么补40g 蛋白？",
    "适合的高蛋白加餐？",
    "外食怎么补足蛋白？",
    "今天其余营养怎么搭配？",
  ]);
  assert.equal(brief.remaining.protein, 40);
});

test("archives the active conversation, creates a new one, and keeps history", async () => {
  const { db, rows } = createDb();
  const service = createCoachDataService({ db, ...dependencies(), answer: null });

  const result = await service.restartConversation("user-1");

  assert.equal(result.messages.length, 0);
  assert.notEqual(result.conversationId, "conversation-1");
  assert.ok(rows.coach_conversations.find((row) => row.id === "conversation-1").archived_at);
  assert.ok(rows.coach_messages.find((row) => row.id === "old-message"));
  assert.equal((await service.getMessages("user-1")).length, 0);
});

test("returns a daily tip from the server context provider", async () => {
  const { db } = createDb();
  const service = createCoachDataService({
    db,
    ...dependencies(),
    answer: null,
    dailyTip: async ({ date, context }) => ({
      type: "food_knowledge",
      headline: "看营养成分表",
      content: `${date} 的蛋白质缺口是 ${context.daily.remaining.protein}g。`,
      food: null,
      source: "rule_v2",
      model: null,
    }),
  });

  const result = await service.getDailyTip("user-1", "2026-07-20");

  assert.equal(result.type, "food_knowledge");
  assert.match(result.content, /40g/);
});
