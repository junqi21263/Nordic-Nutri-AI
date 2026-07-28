import assert from "node:assert/strict";
import test from "node:test";

import { createFoodAdminService, FoodAdminError } from "./food-admin-service.cjs";

function makeRepo({ isAdmin = true } = {}) {
  const state = { foods: {}, images: {}, jobs: [], missing: [] };
  return {
    _state: state,
    async isAdmin() { return isAdmin; },
    async createSyncJob(record) { const job = { id: "job1", ...record }; state.jobs.push(job); return job; },
    async finishSyncJob(id, summary) { const j = state.jobs.find((x) => x.id === id); if (j) Object.assign(j, summary); },
    async upsertFood(record) { const f = { id: `f${Object.keys(state.foods).length + 1}`, ...record }; state.foods[f.id] = f; return f; },
    async saveSourcePayload() {},
    async bindTags() {},
    async getFoodById(id) { return state.foods[id] ?? null; },
    async createImageTask() {},
    async listMissingImages(limit) { return state.missing.slice(0, limit); },
    async listSyncJobs(limit) { return state.jobs.slice(0, limit); },
    async reviewImage() {},
    async updateFood() {},
    async setPrimaryImage() {},
  };
}

function makeUsda({ foods = [] } = {}) {
  return { search: async () => ({ foods, totalHits: foods.length }) };
}

function makeNormalizer() {
  return { normalizeFoodRecord: (x) => ({
    name_zh: null, name_en: x.name_en, normalized_name: String(x.name_en ?? "").toLowerCase(),
    brand_name: x.brand_name ?? null, description: x.description ?? null,
    search_keywords: [], nutrition: { calories: x.calories ?? 0, protein_g: x.protein_g ?? 0, carbs_g: x.carbs_g ?? 0, fat_g: x.fat_g ?? 0 },
    auto_tags: [],
  }) };
}

test("rejects non-admin users", async () => {
  const svc = createFoodAdminService({ repository: makeRepo({ isAdmin: false }), usdaService: makeUsda(), normalizer: makeNormalizer(), imageService: {} });
  await assert.rejects(() => svc.importUsda("u1", { query: "chicken" }), /FORBIDDEN/);
  await assert.rejects(() => svc.syncImages("u1", "f1"), /FORBIDDEN/);
  await assert.rejects(() => svc.reviewImage("u1", "img1", { status: "ready" }), /FORBIDDEN/);
});

test("importUsda dryRun reports counts without writing jobs", async () => {
  const repo = makeRepo();
  const usda = makeUsda({ foods: [
    { source: "usda", sourceId: "1", fdcId: 1, name_en: "Chicken", calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, rawPayload: {} },
    { source: "usda", sourceId: "2", fdcId: 2, name_en: "Salmon", calories: 206, protein_g: 22, carbs_g: 0, fat_g: 12, rawPayload: {} },
  ] });
  const svc = createFoodAdminService({ repository: repo, usdaService: usda, normalizer: makeNormalizer(), imageService: null });
  const result = await svc.importUsda("admin1", { query: "chicken", dryRun: true });
  assert.equal(result.dryRun, true);
  assert.equal(result.success, 2);
  assert.equal(repo._state.jobs.length, 0);
});

test("importUsda persists foods and a sync job", async () => {
  const repo = makeRepo();
  const usda = makeUsda({ foods: [{ source: "usda", sourceId: "1", fdcId: 1, name_en: "Chicken", calories: 165, protein_g: 31, carbs_g: 0, fat_g: 3.6, rawPayload: {} }] });
  const svc = createFoodAdminService({ repository: repo, usdaService: usda, normalizer: makeNormalizer(), imageService: null });
  const result = await svc.importUsda("admin1", { query: "chicken", maxItems: 1 });
  assert.equal(result.success, 1);
  assert.equal(Object.keys(repo._state.foods).length, 1);
  assert.equal(repo._state.jobs.length, 1);
  assert.equal(repo._state.jobs[0].status, "succeeded");
  assert.equal(repo._state.foods.f1.nameZh, "鸡肉");
});

test("importUsda rejects invalid query", async () => {
  const svc = createFoodAdminService({ repository: makeRepo(), usdaService: makeUsda(), normalizer: makeNormalizer(), imageService: null });
  await assert.rejects(() => svc.importUsda("admin1", { query: "a" }), /FOOD_QUERY_INVALID/);
});

test("reviewImage rejects invalid status", async () => {
  const svc = createFoodAdminService({ repository: makeRepo(), usdaService: makeUsda(), normalizer: makeNormalizer(), imageService: null });
  await assert.rejects(() => svc.reviewImage("admin1", "img1", { status: "bogus" }), /FOOD_IMAGE_STATUS_INVALID/);
});

test("syncImages queues 5 priority tasks", async () => {
  const repo = makeRepo();
  repo._state.foods.f1 = { id: "f1", imageEntityKey: "ent1", sourceId: "1" };
  let tasks = 0;
  repo.createImageTask = async () => { tasks += 1; return {}; };
  const svc = createFoodAdminService({ repository: repo, usdaService: makeUsda(), normalizer: makeNormalizer(), imageService: {} });
  const result = await svc.syncImages("admin1", "f1");
  assert.equal(result.queued, 5);
  assert.equal(tasks, 5);
});

test("syncImages throws FOOD_NOT_FOUND for missing food", async () => {
  const svc = createFoodAdminService({ repository: makeRepo(), usdaService: makeUsda(), normalizer: makeNormalizer(), imageService: {} });
  await assert.rejects(() => svc.syncImages("admin1", "missing"), /FOOD_NOT_FOUND/);
});
