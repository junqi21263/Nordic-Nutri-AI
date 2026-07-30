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
    async listFoodsForAdmin(query) {
      const items = Object.values(state.foods).filter((f) => {
        if (query.active === "true" && !f.isActive) return false;
        if (query.active === "false" && f.isActive) return false;
        if (query.missingImage === true || query.missingImage === "true") {
          if (f.primaryImageId) return false;
        }
        return true;
      });
      return { items, pagination: { page: 1, pageSize: 20, total: items.length, hasMore: false } };
    },
    async createManualFood(input) {
      const f = {
        id: `f${Object.keys(state.foods).length + 1}`,
        source: "manual",
        sourceId: input.sourceId || `manual-${Object.keys(state.foods).length + 1}`,
        nameZh: input.nameZh,
        nameEn: input.nameEn,
        isActive: true,
        publishStatus: "published",
        nutritionPer100g: {
          calories: input.calories,
          protein: input.proteinG,
          carbs: input.carbsG,
          fat: input.fatG,
        },
      };
      state.foods[f.id] = f;
      return f;
    },
    async getFoodByIdAdmin(id) { return state.foods[id] ?? null; },
    async archiveFood(id) {
      const f = state.foods[id];
      if (!f) return null;
      f.isActive = false;
      return f;
    },
    async restoreFood(id) {
      const f = state.foods[id];
      if (!f) return null;
      f.isActive = true;
      return f;
    },
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

test("listFoods returns paginated admin catalog rows", async () => {
  const repo = makeRepo();
  repo._state.foods.f1 = { id: "f1", nameZh: "苹果", isActive: true };
  repo._state.foods.f2 = { id: "f2", nameZh: "Archived", isActive: false };
  const svc = createFoodAdminService({ repository: repo, usdaService: makeUsda(), normalizer: makeNormalizer(), imageService: null });
  const activeOnly = await svc.listFoods("admin1", { active: "true" });
  assert.equal(activeOnly.items.length, 1);
  assert.equal(activeOnly.items[0].id, "f1");
  const all = await svc.listFoods("admin1", { active: "all" });
  assert.equal(all.items.length, 2);
});

test("createFood validates required nutrition fields", async () => {
  const svc = createFoodAdminService({ repository: makeRepo(), usdaService: makeUsda(), normalizer: makeNormalizer(), imageService: null });
  await assert.rejects(() => svc.createFood("admin1", { nameZh: "测试" }), /FOOD_INVALID/);
  await assert.rejects(() => svc.createFood("admin1", { nameZh: "测试", calories: 100, proteinG: -1, carbsG: 0, fatG: 0 }), /FOOD_INVALID/);
});

test("createFood persists a manual food record", async () => {
  const repo = makeRepo();
  const svc = createFoodAdminService({ repository: repo, usdaService: makeUsda(), normalizer: makeNormalizer(), imageService: null });
  const food = await svc.createFood("admin1", {
    nameZh: "手工录入",
    calories: 120,
    proteinG: 10,
    carbsG: 5,
    fatG: 3,
  });
  assert.equal(food.nameZh, "手工录入");
  assert.equal(Object.keys(repo._state.foods).length, 1);
});

test("archiveFood and restoreFood toggle isActive", async () => {
  const repo = makeRepo();
  repo._state.foods.f1 = { id: "f1", nameZh: "苹果", isActive: true };
  const svc = createFoodAdminService({ repository: repo, usdaService: makeUsda(), normalizer: makeNormalizer(), imageService: null });
  const archived = await svc.archiveFood("admin1", "f1");
  assert.equal(archived.isActive, false);
  const restored = await svc.restoreFood("admin1", "f1");
  assert.equal(restored.isActive, true);
  await assert.rejects(() => svc.archiveFood("admin1", "missing"), /FOOD_NOT_FOUND/);
});

test("getFood returns admin detail or FOOD_NOT_FOUND", async () => {
  const repo = makeRepo();
  repo._state.foods.f1 = { id: "f1", nameZh: "苹果", isActive: true, publishStatus: "draft" };
  const svc = createFoodAdminService({ repository: repo, usdaService: makeUsda(), normalizer: makeNormalizer(), imageService: null });
  const food = await svc.getFood("admin1", "f1");
  assert.equal(food.publishStatus, "draft");
  await assert.rejects(() => svc.getFood("admin1", "missing"), /FOOD_NOT_FOUND/);
});
