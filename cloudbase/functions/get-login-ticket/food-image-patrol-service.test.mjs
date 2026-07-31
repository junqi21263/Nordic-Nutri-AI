import assert from "node:assert/strict";
import test from "node:test";

import {
  createFoodImagePatrolService,
  PATROL_DAILY_CAP,
} from "./food-image-patrol-service.cjs";

function mockDb({ rules = [], categories = [], batches = [] } = {}) {
  const state = { rules: rules.map((row) => ({ ...row })), categories, batches, updates: [] };
  return {
    state,
    from(table) {
      const api = {
        select() { return api; },
        eq() { return api; },
        in() { return api; },
        order() { return api; },
        limit() { return api; },
        maybeSingle: async () => {
          if (table === "food_categories") return { data: state.categories[0] || null, error: null };
          if (table === "food_image_patrol_rules") return { data: state.rules[0] || null, error: null };
          return { data: null, error: null };
        },
        then: undefined,
        insert(payload) {
          const row = {
            id: "rule-new",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...payload,
          };
          state.rules.push(row);
          const query = {
            select() { return query; },
            maybeSingle: async () => ({ data: row, error: null }),
          };
          return query;
        },
        update(payload) {
          state.updates.push({ table, payload });
          const query = {
            eq() { return query; },
            select() { return query; },
            maybeSingle: async () => ({
              data: { ...(state.rules[0] || {}), ...payload, id: state.rules[0]?.id || "rule-1" },
              error: null,
            }),
          };
          return query;
        },
        delete() {
          const query = {
            eq: async () => ({ error: null }),
          };
          return query;
        },
      };
      api.then = (resolve, reject) => Promise.resolve({
        data: table === "food_image_patrol_rules" ? state.rules
          : table === "food_image_batches" ? state.batches
            : table === "food_categories" ? state.categories : [],
        error: null,
      }).then(resolve, reject);
      return api;
    },
  };
}

test("remainingQuota respects the hard daily cap of 500", async () => {
  const db = mockDb();
  const service = createFoodImagePatrolService({
    db,
    repository: { async isAdmin() { return true; } },
    batches: {},
    jobs: {
      dailyLimit: 5000,
      async getDailyUsage() { return 480; },
    },
    dailyCap: PATROL_DAILY_CAP,
  });
  const quota = await service.remainingQuota();
  assert.equal(quota.limit, 500);
  assert.equal(quota.remaining, 20);
});

test("runTrusted creates and starts a batch sized to remaining quota", async () => {
  const db = mockDb({
    rules: [{
      id: "rule-1",
      category_id: "cat-meat",
      visual_profile_key: "raw",
      batch_size: 40,
      enabled: true,
      created_by: "admin-1",
      last_run_at: null,
    }],
    categories: [{ id: "cat-meat", code: "meat", name_zh: "肉禽" }],
    batches: [],
  });
  const created = [];
  const started = [];
  const service = createFoodImagePatrolService({
    db,
    repository: { async isAdmin() { return true; } },
    batches: {
      async createFromCategory(userId, input) {
        created.push({ userId, input });
        return { id: "batch-1", totalCount: input.count };
      },
      async start(userId, batchId) {
        started.push({ userId, batchId });
        return { id: batchId, status: "running" };
      },
    },
    jobs: {
      dailyLimit: 500,
      async getDailyUsage() { return 490; },
    },
  });

  const result = await service.runTrusted();
  assert.equal(created.length, 1);
  assert.equal(created[0].userId, "admin-1");
  assert.equal(created[0].input.count, 10);
  assert.equal(created[0].input.categoryId, "cat-meat");
  assert.equal(created[0].input.visualProfileKey, "raw");
  assert.deepEqual(started, [{ userId: "admin-1", batchId: "batch-1" }]);
  assert.equal(result.created.length, 1);
  assert.equal(result.quota.remaining, 0);
});

test("runTrusted skips when an active category batch already exists", async () => {
  const db = mockDb({
    rules: [{
      id: "rule-1",
      category_id: "cat-meat",
      visual_profile_key: "raw",
      batch_size: 20,
      enabled: true,
      created_by: "admin-1",
      last_run_at: null,
    }],
    categories: [{ id: "cat-meat", code: "meat", name_zh: "肉禽" }],
    batches: [{
      id: "batch-active",
      status: "running",
      selection_json: { categoryId: "cat-meat", visualProfileKey: "raw" },
    }],
  });
  let createCalls = 0;
  const service = createFoodImagePatrolService({
    db,
    repository: { async isAdmin() { return true; } },
    batches: {
      async createFromCategory() { createCalls += 1; return { id: "x" }; },
      async start() { return {}; },
    },
    jobs: { dailyLimit: 500, async getDailyUsage() { return 0; } },
  });
  const result = await service.runTrusted();
  assert.equal(createCalls, 0);
  assert.equal(result.skipped[0].reason, "active_batch");
});

test("runTrusted respects per-rule interval but runNow forces past it", async () => {
  const recent = new Date(Date.now() - 10 * 60_000).toISOString();
  const db = mockDb({
    rules: [{
      id: "rule-1",
      category_id: "cat-meat",
      visual_profile_key: "auto",
      batch_size: 20,
      interval_minutes: 60,
      enabled: true,
      created_by: "admin-1",
      last_run_at: recent,
    }],
    categories: [{ id: "cat-meat", code: "meat", name_zh: "肉禽" }],
    batches: [],
  });
  const created = [];
  const service = createFoodImagePatrolService({
    db,
    repository: { async isAdmin() { return true; } },
    batches: {
      async createFromCategory(userId, input) {
        created.push(input);
        return { id: "batch-forced", totalCount: input.count };
      },
      async start() { return { id: "batch-forced", status: "running" }; },
    },
    jobs: { dailyLimit: 500, async getDailyUsage() { return 0; } },
  });

  const timed = await service.runTrusted();
  assert.equal(created.length, 0);
  assert.equal(timed.skipped[0].reason, "interval");

  const forced = await service.runNow("admin-1");
  assert.equal(created.length, 1);
  assert.equal(forced.created.length, 1);
});

test("runTrusted creates when elapsed exceeds the rule interval", async () => {
  const old = new Date(Date.now() - 65 * 60_000).toISOString();
  const db = mockDb({
    rules: [{
      id: "rule-1",
      category_id: "cat-meat",
      visual_profile_key: "auto",
      batch_size: 20,
      interval_minutes: 60,
      enabled: true,
      created_by: "admin-1",
      last_run_at: old,
    }],
    categories: [{ id: "cat-meat", code: "meat", name_zh: "肉禽" }],
    batches: [],
  });
  let createCalls = 0;
  const service = createFoodImagePatrolService({
    db,
    repository: { async isAdmin() { return true; } },
    batches: {
      async createFromCategory() {
        createCalls += 1;
        return { id: "batch-due", totalCount: 20 };
      },
      async start() { return { id: "batch-due", status: "running" }; },
    },
    jobs: { dailyLimit: 500, async getDailyUsage() { return 0; } },
  });
  const result = await service.runTrusted();
  assert.equal(createCalls, 1);
  assert.equal(result.created.length, 1);
});

test("runTrusted maps empty selection to no_candidates with a clear message", async () => {
  const db = mockDb({
    rules: [{
      id: "rule-1",
      category_id: "cat-meat",
      visual_profile_key: "auto",
      batch_size: 20,
      enabled: true,
      created_by: "admin-1",
      last_run_at: null,
    }],
    categories: [{ id: "cat-meat", code: "meat", name_zh: "肉禽" }],
    batches: [],
  });
  const service = createFoodImagePatrolService({
    db,
    repository: { async isAdmin() { return true; } },
    batches: {
      async createFromCategory() {
        const error = new Error("empty");
        error.code = "FOOD_IMAGE_BATCH_SELECTION_EMPTY";
        throw error;
      },
      async start() { return {}; },
    },
    jobs: { dailyLimit: 500, async getDailyUsage() { return 0; } },
  });
  const result = await service.runTrusted();
  assert.equal(result.skipped[0].reason, "no_candidates");
  assert.match(result.skipped[0].message, /暂无缺主图候选/);
  assert.ok(db.state.updates.some((entry) => /暂无缺主图候选/.test(entry.payload?.last_error || "")));
});

test("upsertRule requires admin and stores batch size", async () => {
  const db = mockDb({
    categories: [{ id: "cat-meat", code: "meat", name_zh: "肉禽" }],
    rules: [],
  });
  const service = createFoodImagePatrolService({
    db,
    repository: { async isAdmin(userId) { return userId === "admin-1"; } },
    batches: {},
    jobs: { dailyLimit: 500, async getDailyUsage() { return 0; } },
  });
  await assert.rejects(() => service.upsertRule("user", { categoryId: "cat-meat" }), /FORBIDDEN/);
  const rule = await service.upsertRule("admin-1", {
    categoryId: "cat-meat",
    visualProfileKey: "cooked_plain",
    batchSize: 25,
    intervalMinutes: 120,
  });
  assert.equal(rule.categoryId, "cat-meat");
  assert.equal(rule.batchSize, 25);
  assert.equal(rule.visualProfileKey, "cooked_plain");
  assert.equal(rule.intervalMinutes, 120);
  assert.equal(rule.intervalLabel, "每 2 小时");
});
