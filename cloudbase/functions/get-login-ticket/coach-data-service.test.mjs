import assert from "node:assert/strict";
import test from "node:test";

import {
  createCoachDataService,
  createRuleReply,
  isNutritionFollowUp,
  isNutritionQuestion,
  proteinFoodSuggestions,
  quickPromptsForContext,
} from "./coach-data-service.cjs";

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
  const usage = new Map();
  const rows = {
    coach_conversations: [{ id: "conversation-1", user_id: "user-1", archived_at: null }],
    coach_messages: [{ id: "old-message", user_id: "user-1", conversation_id: "conversation-1", role: "assistant", content: "历史消息", created_at: "2026-07-20T10:00:00.000Z" }],
    coach_daily_tips: [],
  };
  const db = {
    async rpc(name, input) {
      const key = `${input.p_user_id}:coach_daily_message`;
      const usedCount = usage.get(key) ?? 0;
      if (name === "get_coach_daily_message_usage") return { data: [{ used_count: usedCount }], error: null };
      if (name === "consume_coach_daily_message") {
        if (usedCount >= input.p_limit) return { data: [{ allowed: false, used_count: usedCount }], error: null };
        const nextCount = usedCount + 1;
        usage.set(key, nextCount);
        return { data: [{ allowed: true, used_count: nextCount }], error: null };
      }
      return { data: null, error: { message: "Unexpected RPC" } };
    },
    from(table) {
      if (!rows[table]) rows[table] = [];
      let selectedRows = rows[table];
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
        async upsert(payload) {
          const values = Array.isArray(payload) ? payload : [payload];
          for (const value of values) {
            const existing = rows[table].find((row) => row.user_id === value.user_id && row.tip_date === value.tip_date);
            if (existing) Object.assign(existing, value);
            else rows[table].push({ id: `${table}-${rows[table].length + 1}`, ...value });
          }
          return { data: values, error: null };
        },
      };
    },
  };
  return { db, inserts, rows, usage };
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

test("builds model context from today's summary without a weekly meal scan", async () => {
  const answerCalls = [];
  let weeklyCalls = 0;
  const { db } = createDb();
  const service = createCoachDataService({
    db,
    ...dependencies({
      getWeeklyReview: async () => {
        weeklyCalls += 1;
        return { recordedDays: 5, proteinCompletion: 83, score: 79 };
      },
    }),
    answer: async (input) => { answerCalls.push(input); return validReply; },
  });

  await service.sendMessage("user-1", validRequest);

  assert.equal(weeklyCalls, 0);
  assert.deepEqual(answerCalls[0].context.weekly, { recordedDays: 1, proteinCompletion: 72, score: 72 });
  assert.deepEqual(answerCalls[0].context.preferences, {
    dietaryPattern: "均衡饮食",
    dietaryPatternLabel: "均衡饮食",
    foodAvoidances: ["花生"],
    foodAvoidanceLabels: ["花生"],
    mealsPerDay: 3,
  });
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

test("enforces an atomic 20-message daily limit before invoking the model", async () => {
  const { db, usage } = createDb();
  let calls = 0;
  const service = createCoachDataService({
    db,
    ...dependencies(),
    answer: async () => { calls += 1; return validReply; },
  });

  for (let index = 1; index <= 20; index += 1) {
    const result = await service.sendMessage("user-1", {
      ...validRequest,
      clientRequestId: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    });
    assert.equal(result.dailyUsage.used, index);
    assert.equal(result.dailyUsage.remaining, 20 - index);
  }

  await assert.rejects(
    () => service.sendMessage("user-1", {
      ...validRequest,
      clientRequestId: "00000000-0000-4000-8000-000000000021",
    }),
    (error) => error.code === "COACH_DAILY_LIMIT_REACHED" && error.message === "因个人开发成本有限，当前每人每日限制聊20句",
  );
  assert.equal(calls, 20);
  assert.equal(usage.get("user-1:coach_daily_message"), 20);
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
  assert.match(result.messages[1].content, /更擅长日常饮食建议|蓝莓营养怎么样|晚餐怎么补蛋白/);
});

test("treats a food's daily nutrition value as an in-scope coach question", async () => {
  const { db } = createDb();
  let calls = 0;
  const service = createCoachDataService({
    db,
    ...dependencies(),
    answer: async () => { calls += 1; return validReply; },
  });

  const result = await service.sendMessage("user-1", {
    ...validRequest,
    clientRequestId: "33333333-3333-4333-8333-333333333334",
    prompt: "蓝莓有什么好处？",
  });

  assert.equal(calls, 1);
  assert.equal(result.reply.source, "deepseek");
});

test("continues a short food follow-up after an in-scope nutrition question", async () => {
  const { db } = createDb();
  const prompts = [];
  const service = createCoachDataService({
    db,
    ...dependencies(),
    answer: async ({ prompt }) => { prompts.push(prompt); return validReply; },
  });

  await service.sendMessage("user-1", {
    ...validRequest,
    clientRequestId: "33333333-3333-4333-8333-333333333335",
    prompt: "蓝莓有什么好处？",
  });
  const result = await service.sendMessage("user-1", {
    ...validRequest,
    clientRequestId: "33333333-3333-4333-8333-333333333336",
    prompt: "香蕉呢？",
  });

  assert.deepEqual(prompts, ["蓝莓有什么好处？", "香蕉呢？"]);
  assert.equal(result.reply.source, "deepseek");
});

test("keeps the latest nutrition context for a short follow-up in a long conversation", async () => {
  const { db, rows } = createDb();
  const prompts = [];
  for (let index = 0; index < 12; index += 1) {
    rows.coach_messages.push({
      id: `older-message-${index}`,
      user_id: "user-1",
      conversation_id: "conversation-1",
      role: index % 2 ? "assistant" : "user",
      content: index % 2 ? "旧回复" : "旧问题",
      created_at: `2026-07-19T10:00:${String(index).padStart(2, "0")}.000Z`,
    });
  }
  const service = createCoachDataService({
    db,
    ...dependencies(),
    answer: async ({ prompt }) => { prompts.push(prompt); return validReply; },
  });

  await service.sendMessage("user-1", {
    ...validRequest,
    clientRequestId: "33333333-3333-4333-8333-333333333337",
    prompt: "草莓有什么好处？",
  });
  const result = await service.sendMessage("user-1", {
    ...validRequest,
    clientRequestId: "33333333-3333-4333-8333-333333333338",
    prompt: "蓝莓呢？",
  });

  assert.deepEqual(prompts.slice(-2), ["草莓有什么好处？", "蓝莓呢？"]);
  assert.equal(result.reply.source, "deepseek");
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

test("strips Markdown emphasis and answer prefixes from streamed coach text", async () => {
  const { db } = createDb();
  const service = createCoachDataService({
    db,
    ...dependencies(),
    streamAnswer: async function* () {
      yield "**回复**：";
      yield "**主选蛋白质**：鸡胸肉。";
    },
  });

  const events = [];
  for await (const event of service.streamMessage("user-1", {
    ...validRequest,
    clientRequestId: "66666666-6666-4666-8666-666666666666",
  })) events.push(event);

  assert.equal(events[0].type, "delta");
  assert.equal(events[0].text, "主选蛋白质：鸡胸肉。");
  assert.doesNotMatch(events[0].text, /\*\*|回复：/);
  assert.doesNotMatch(events[1].messages[1].content, /\*\*|回复：/);
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
    "避开花生吃什么？",
    "外食怎么避开花生？",
    "忌口加餐怎么安排？",
    "晚餐怎么补40g 蛋白？",
  ]);
  assert.equal(brief.remaining.protein, 40);
});

test("brief exposes server time and a rule-based hero question without LLM latency", async () => {
  const { db } = createDb();
  let quickPromptCalls = 0;
  const dailyTip = async () => ({ source: "rule_v2" });
  dailyTip.getQuickPrompt = async () => {
    quickPromptCalls += 1;
    return {
      prompt: "下午训练后怎么补充蛋白质？",
      source: "deepseek",
      model: "deepseek-v4-flash",
    };
  };
  const service = createCoachDataService({
    db,
    ...dependencies(),
    answer: null,
    dailyTip,
    clock: () => new Date("2026-07-29T08:36:00.000Z"),
  });

  const brief = await service.getBrief("user-1", "2026-07-20");

  assert.equal(brief.serverTime, "2026-07-29T08:36:00.000Z");
  assert.equal(brief.heroPrompt, "避开花生吃什么？");
  assert.equal(quickPromptCalls, 0);
  assert.equal(brief.quickPrompts.length, 4);
  assert.deepEqual(brief.quickPrompts, [
    "避开花生吃什么？",
    "外食怎么避开花生？",
    "忌口加餐怎么安排？",
    "晚餐怎么补40g 蛋白？",
  ]);
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

test("maps missing app_users foreign-key failures to SESSION_USER_MISSING", async () => {
  const db = {
    from(table) {
      assert.equal(table, "coach_conversations");
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        is() { return chain; },
        order() { return chain; },
        limit() { return chain; },
        async maybeSingle() { return { data: null, error: null }; },
      };
      return {
        select() { return chain; },
        insert() {
          return {
            select() {
              return {
                async single() {
                  return {
                    data: null,
                    error: {
                      code: "DATABASE_23503",
                      message: 'insert or update on table "coach_conversations" violates foreign key constraint "coach_conversations_user_id_fkey"',
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  const service = createCoachDataService({ db, ...dependencies(), answer: null });
  await assert.rejects(
    () => service.getMessages("missing-user"),
    (error) => error.code === "SESSION_USER_MISSING",
  );
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
  assert.equal(result.cached, false);
});

test("reuses a cached daily tip for the same nutrition context", async () => {
  const { db } = createDb();
  let calls = 0;
  const service = createCoachDataService({
    db,
    ...dependencies(),
    answer: null,
    dailyTip: async () => {
      calls += 1;
      return {
        type: "nutrition_tip",
        headline: "下一餐加鸡蛋",
        content: "用鸡蛋搭配蔬菜和主食，补足今天的蛋白质缺口。",
        food: null,
        source: "hunyuan-exp",
        model: "hunyuan",
      };
    },
  });

  const first = await service.getDailyTip("user-1", "2026-07-20");
  const second = await service.getDailyTip("user-1", "2026-07-20");
  const refreshed = await service.getDailyTip("user-1", "2026-07-20", { refresh: true });

  assert.equal(calls, 2);
  assert.equal(first.cached, false);
  assert.equal(second.cached, true);
  assert.equal(second.headline, "下一餐加鸡蛋");
  assert.equal(refreshed.cached, false);
});

test("shares one context build across concurrent brief and tip requests", async () => {
  let summaryCalls = 0;
  const { db } = createDb();
  const service = createCoachDataService({
    db,
    ...dependencies({
      getDailySummary: async () => {
        summaryCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return {
          targets: { calories: 2400, protein: 150, carbs: 280, fat: 70 },
          consumed: { calories: 1700, protein: 110, carbs: 190, fat: 45 },
          remaining: { calories: 700, protein: 40, carbs: 90, fat: 25 },
          completion: 72,
          meals: [{ id: "meal-1" }],
        };
      },
    }),
    answer: null,
    dailyTip: async () => ({
      type: "nutrition_tip",
      headline: "下一餐加鸡蛋",
      content: "用鸡蛋搭配蔬菜和主食。",
      food: null,
      source: "rule_v2",
      model: null,
    }),
  });

  await Promise.all([
    service.getBrief("user-1", "2026-07-20"),
    service.getDailyTip("user-1", "2026-07-20"),
  ]);

  assert.equal(summaryCalls, 1);
});

test("protein suggestions omit avoided eggs and seafood", () => {
  const foods = proteinFoodSuggestions({
    dietaryPattern: "none",
    foodAvoidances: ["eggs", "seafood"],
  });
  assert.ok(foods.every((food) => !food.includes("鸡蛋") && !food.includes("鱼") && !food.includes("虾")));
  assert.ok(foods.some((food) => food.includes("豆腐") || food.includes("鸡")));
});

test("rule reply respects avoidances when suggesting protein", () => {
  const reply = createRuleReply("晚餐怎么补蛋白？", {
    goalType: "muscle_gain",
    daily: {
      targets: {},
      consumed: {},
      remaining: { calories: 700, protein: 40, carbs: 90, fat: 25 },
      completion: 72,
      mealCount: 1,
    },
    weekly: { recordedDays: 5, proteinCompletion: 83, score: 79 },
    preferences: {
      dietaryPattern: "none",
      dietaryPatternLabel: "无特殊",
      foodAvoidances: ["eggs", "seafood"],
      foodAvoidanceLabels: ["鸡蛋", "海鲜"],
      mealsPerDay: 3,
    },
  });
  assert.equal(reply.priority, "protein");
  assert.match(JSON.stringify(reply), /忌口/);
  assert.match(reply.actions[0].detail, /安排一掌心鸡胸肉、豆腐/);
  assert.doesNotMatch(reply.actions[0].detail, /安排一掌心[^。]*(鸡蛋|鱼肉|虾仁)/);
});

test("quick prompts fill most slots from avoidance when only spicy is set", () => {
  const prompts = quickPromptsForContext({
    daily: {
      remaining: { calories: 1900, protein: 120, carbs: 200, fat: 60 },
      mealCount: 0,
    },
    preferences: {
      dietaryPattern: "none",
      dietaryPatternLabel: "无特殊",
      foodAvoidanceLabels: ["辛辣食物"],
      mealsPerDay: 3,
    },
  });
  assert.equal(prompts.length, 4);
  assert.deepEqual(prompts.slice(0, 3), [
    "避开辛辣食物吃什么？",
    "外食怎么避开辛辣食物？",
    "忌口加餐怎么安排？",
  ]);
  assert.equal(prompts[3], "我想补记今天的一餐");
});

test("logging day still surfaces diet preference and avoidance prompts", () => {
  const prompts = quickPromptsForContext({
    daily: {
      remaining: { calories: 1900, protein: 120, carbs: 200, fat: 60 },
      mealCount: 0,
    },
    preferences: {
      dietaryPattern: "vegetarian",
      dietaryPatternLabel: "素食为主",
      foodAvoidances: ["spicy"],
      foodAvoidanceLabels: ["辛辣食物"],
      mealsPerDay: 4,
    },
  });
  assert.equal(prompts.length, 4);
  assert.equal(prompts[0], "素食为主下一餐怎么搭？");
  assert.ok(prompts.some((prompt) => prompt.includes("辛辣食物")));
  assert.ok(prompts.some((prompt) => prompt.includes("4餐")));
});

test("nutrition scope accepts common food names and nutrient ask patterns", () => {
  assert.equal(isNutritionQuestion("蓝莓"), true);
  assert.equal(isNutritionQuestion("鸡胸肉怎么样"), true);
  assert.equal(isNutritionQuestion("蓝莓适不适合加餐"), true);
  assert.equal(isNutritionQuestion("今天股市怎么样"), false);
});

test("nutrition follow-up chains across multiple food prompts", () => {
  const history = [
    { role: "user", content: "晚餐怎么补蛋白？" },
    { role: "assistant", content: "可以安排鸡胸肉。" },
    { role: "user", content: "猪肉呢" },
    { role: "assistant", content: "瘦猪肉也可以。" },
  ];
  assert.equal(isNutritionFollowUp("蓝莓呢", history), true);
  assert.equal(isNutritionFollowUp("蓝莓呢", [{ role: "user", content: "你好吗" }]), false);
});

test("rule reply accepts in-scope follow-ups without keyword match", () => {
  const reply = createRuleReply("那个怎么样", {
    goalType: "maintenance",
    daily: {
      targets: {},
      consumed: {},
      remaining: { calories: 500, protein: 20, carbs: 50, fat: 15 },
      completion: 60,
      mealCount: 2,
    },
    weekly: { recordedDays: 3, proteinCompletion: 70, score: 70 },
    preferences: {
      dietaryPattern: "none",
      dietaryPatternLabel: "无特殊",
      foodAvoidances: [],
      foodAvoidanceLabels: [],
      mealsPerDay: 3,
    },
  }, { inScope: true });
  assert.notEqual(reply.headline, "我更擅长日常饮食建议");
  assert.notEqual(reply.headline, "我只提供日常营养建议");
});
