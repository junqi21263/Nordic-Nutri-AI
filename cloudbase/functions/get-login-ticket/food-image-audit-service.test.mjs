import assert from "node:assert/strict";
import test from "node:test";

import { createFoodImageAuditService } from "./food-image-audit-service.cjs";

function createAuditDb() {
  const state = {
    food_image_audit_runs: [],
    food_image_audit_items: [],
    food_images: [{ id: "old-powder", is_primary: true }],
  };
  const writes = [];
  let id = 0;

  function query(table) {
    let filters = [];
    let payload = null;
    let mode = "select";
    let selected = null;
    const chain = {
      select(columns = "*") { selected = columns; return this; },
      eq(column, value) { filters.push([column, value]); return this; },
      in(column, values) { filters.push([column, values]); return this; },
      order() { return this; },
      insert(value) { mode = "insert"; payload = value; return this; },
      update(value) { mode = "update"; payload = value; return this; },
      maybeSingle() { return resolve(true); },
      single() { return resolve(true); },
      then(resolve, reject) { return resolveQuery().then(resolve, reject); },
    };
    const matches = (row) => filters.every(([column, value]) => Array.isArray(value) ? value.includes(row[column]) : row[column] === value);
    async function resolve(single) {
      const result = await resolveQuery();
      return { ...result, data: single ? (result.data[0] ?? null) : result.data };
    }
    async function resolveQuery() {
      const rows = state[table] ?? [];
      if (mode === "select") {
        const matched = rows.filter(matches);
        if (selected?.includes("food_image_audit_items")) {
          return { data: matched.map((run) => ({ ...run, items: state.food_image_audit_items.filter((item) => item.run_id === run.id) })), error: null };
        }
        return { data: matched, error: null };
      }
      if (mode === "insert") {
        const input = Array.isArray(payload) ? payload : [payload];
        const inserted = input.map((row) => ({ id: row.id ?? `${table}-${++id}`, ...row }));
        state[table].push(...inserted);
        writes.push({ table, mode, payload: inserted });
        return { data: inserted, error: null };
      }
      const updated = [];
      for (const row of rows.filter(matches)) {
        Object.assign(row, payload);
        updated.push(row);
      }
      writes.push({ table, mode, payload, filters });
      return { data: updated, error: null };
    }
    return chain;
  }

  return { from: query, state, writes };
}

function createRepository() {
  const candidates = [
    {
      food: { id: "food-powder", nameZh: "低热量水果味饮料粉", nameEn: "Fruit drink powder", category: { code: "fruit", nameZh: "水果" }, tags: [] },
      image: { id: "old-powder", detailUrl: "https://images.example/powder.webp" },
    },
    {
      food: { id: "food-orange", nameZh: "橙子", category: { code: "fruit", nameZh: "水果" }, tags: [] },
      image: { id: "old-orange", detailUrl: "https://images.example/orange.webp" },
    },
    {
      food: { id: "food-wine", nameZh: "仙粉黛红葡萄酒", nameEn: "Zinfandel red wine", category: { code: "fruit", nameZh: "水果" }, tags: [] },
      image: { id: "old-wine", detailUrl: "https://images.example/wine.webp" },
    },
  ];
  const updates = [];
  return {
    candidates,
    updates,
    async listExistingPrimaryImagesForAudit() { return { items: candidates, nextCursor: null }; },
    async updateFood(id, patch) { updates.push({ id, patch }); return { id, ...patch }; },
  };
}

function createService({ auditVision } = {}) {
  const db = createAuditDb();
  const repository = createRepository();
  const jobs = { calls: [], async regenerate(userId, foodId, input) { this.calls.push({ userId, foodId, input }); return { id: "job-1" }; } };
  const service = createFoodImageAuditService({
    db,
    repository,
    auditVision: auditVision ?? (async () => ({ verdict: "fail", detectedSubject: "完整水果", confidence: 0.98, reasons: ["主体不符合饮料粉"] })),
    jobs,
    requireAdmin: async (userId) => { if (userId !== "admin-1") throw new Error("FORBIDDEN"); },
  });
  return { db, repository, jobs, service };
}

test("previewHighRisk persists only processed visual forms and never writes old images", async () => {
  const { db, service } = createService();

  const preview = await service.previewHighRisk("admin-1", { count: 20 });

  assert.equal(preview.items.length, 2);
  assert.deepEqual(preview.items.map((item) => item.visualType), ["drink_powder", "alcohol_bottle"]);
  assert.match(preview.items[0].riskReasons.join(" "), /加工食品/);
  assert.equal(db.state.food_images[0].is_primary, true);
  assert.equal(db.writes.some((write) => write.table === "food_images"), false);
});

test("reviewItems isolates one vision failure and persists other verdicts without touching old images", async () => {
  const { db, service } = createService({
    auditVision: async ({ expectedVisualType }) => {
      if (expectedVisualType === "alcohol_bottle") throw new Error("provider unavailable");
      return { verdict: "fail", detectedSubject: "完整水果", confidence: 0.98, reasons: ["主体不符合饮料粉"] };
    },
  });
  const preview = await service.previewHighRisk("admin-1", { count: 20 });

  const result = await service.reviewItems("admin-1", preview.run.id, { itemIds: preview.items.map((item) => item.id) });

  assert.deepEqual(result.items.map((item) => item.status), ["needs_review", "failed"]);
  assert.equal(db.state.food_images[0].is_primary, true);
  assert.equal(db.writes.some((write) => write.table === "food_images"), false);
});

test("listRun returns the persisted audit run with its immutable item snapshots", async () => {
  const { service } = createService();
  const preview = await service.previewHighRisk("admin-1", { count: 20 });

  const run = await service.listRun("admin-1", preview.run.id);

  assert.equal(run.id, preview.run.id);
  assert.deepEqual(run.items.map((item) => item.oldImageId), ["old-powder", "old-wine"]);
  assert.equal(run.items[0].promptPlan.visualType, "drink_powder");
});

test("keepItem marks only the audit item as kept", async () => {
  const { db, service } = createService();
  const preview = await service.previewHighRisk("admin-1", { count: 20 });

  const kept = await service.keepItem("admin-1", preview.items[0].id);

  assert.equal(kept.status, "kept");
  assert.equal(kept.operatorDecision, "keep");
  assert.equal(db.state.food_images[0].is_primary, true);
});

test("requestRegeneration stores an optional visual override and creates a candidate job without replacing old image", async () => {
  const { db, repository, jobs, service } = createService();
  const preview = await service.previewHighRisk("admin-1", { count: 20 });

  const result = await service.requestRegeneration("admin-1", preview.items[1].id, { visualType: "non_alcohol_wine" });

  assert.equal(result.status, "regeneration_requested");
  assert.equal(result.regenerationJobId, "job-1");
  assert.deepEqual(repository.updates, [{ id: "food-wine", patch: { visualType: "non_alcohol_wine" } }]);
  assert.equal(jobs.calls[0].foodId, "food-wine");
  assert.equal(db.state.food_images[0].is_primary, true);
  assert.equal(db.writes.some((write) => write.table === "food_images"), false);
});

test("requestRegeneration rejects visual types outside the unified food visual type contract", async () => {
  const { service } = createService();
  const preview = await service.previewHighRisk("admin-1", { count: 20 });

  await assert.rejects(
    () => service.requestRegeneration("admin-1", preview.items[0].id, { visualType: "fruit_powder" }),
    (error) => error.code === "FOOD_IMAGE_AUDIT_VISUAL_TYPE_INVALID",
  );
});
