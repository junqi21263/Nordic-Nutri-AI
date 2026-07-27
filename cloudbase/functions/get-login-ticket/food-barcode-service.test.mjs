import assert from "node:assert/strict";
import test from "node:test";

import { createFoodBarcodeService, FoodBarcodeError } from "./food-barcode-service.cjs";

function makeRepo({ existingBarcode = null, upsertData = null } = {}) {
  const calls = { getBarcode: 0, upsert: 0, savePayload: 0, bindTags: 0, increment: 0 };
  const barcodes = new Map();
  if (existingBarcode) barcodes.set(existingBarcode.barcode, existingBarcode);
  return {
    calls,
    async getFoodByBarcode(code) { calls.getBarcode += 1; return barcodes.get(code) ?? null; },
    async upsertFood(record) { calls.upsert += 1; const f = { id: upsertData?.id ?? "new1", ...record }; if (record.barcode) barcodes.set(record.barcode, f); return f; },
    async saveSourcePayload() { calls.savePayload += 1; },
    async bindTags() { calls.bindTags += 1; },
    async incrementPopularity() { calls.increment += 1; },
    async insertImage() { return { id: "img1" }; },
    async setPrimaryImage() {},
  };
}

test("returns cached food without calling OFF", async () => {
  const repo = makeRepo({ existingBarcode: { id: "f1", barcode: "5449000000996" } });
  const off = { getByBarcode: async () => { throw new Error("should not call"); } };
  const svc = createFoodBarcodeService({ repository: repo, openFoodFacts: off, normalizer: { normalizeFoodRecord: (x) => ({ ...x, normalized_name: "x", search_keywords: [], auto_tags: [], nutrition: {} }) }, imageService: null, imageSyncEnabled: false });
  const result = await svc.lookup("5449000000996");
  assert.equal(result.source, "cache");
  assert.equal(result.food.id, "f1");
  assert.equal(repo.calls.getBarcode, 1);
  assert.equal(repo.calls.upsert, 0);
});

test("rejects invalid barcodes", async () => {
  const svc = createFoodBarcodeService({ repository: makeRepo(), openFoodFacts: {}, normalizer: {}, imageService: null });
  await assert.rejects(() => svc.lookup("abc"), /FOOD_BARCODE_INVALID/);
  await assert.rejects(() => svc.lookup("123"), /FOOD_BARCODE_INVALID/);
});

test("enriches from OFF, upserts, persists payload, binds tags", async () => {
  const repo = makeRepo();
  const off = { getByBarcode: async () => ({
    source: "open_food_facts", sourceId: "5449000000996", barcode: "5449000000996",
    name_en: "Coca Cola", brandName: "Coca-Cola", calories: 42, protein_g: 0, carbs_g: 10.6, fat_g: 0,
    imageUrl: null, license: "ODbL", attribution: "OFF", qualityScore: 70, rawPayload: { code: "5449000000996" },
  }) };
  const normalizer = { normalizeFoodRecord: (x) => ({ name_zh: null, name_en: x.name_en, normalized_name: "coca cola", brand_name: x.brandName, description: x.name_en, search_keywords: ["coca","cola"], nutrition: { calories: 42, protein_g: 0, carbs_g: 10.6, fat_g: 0 }, auto_tags: [] }) };
  const svc = createFoodBarcodeService({ repository: repo, openFoodFacts: off, normalizer, imageService: null, imageSyncEnabled: false });
  const result = await svc.lookup("5449000000996");
  assert.equal(result.source, "open_food_facts");
  assert.equal(repo.calls.upsert, 1);
  assert.equal(repo.calls.savePayload, 1);
  assert.equal(repo.calls.bindTags, 1);
});

test("throws NOT_FOUND when OFF returns 404", async () => {
  const { OpenFoodFactsError } = await import("./open-food-facts-service.cjs");
  const off = { getByBarcode: async () => { throw new OpenFoodFactsError("OFF_HTTP_404"); } };
  const svc = createFoodBarcodeService({ repository: makeRepo(), openFoodFacts: off, normalizer: {}, imageService: null });
  await assert.rejects(() => svc.lookup("5449000000996"), /FOOD_BARCODE_NOT_FOUND/);
});

test("concurrent lookups for same barcode upsert only once", async () => {
  const repo = makeRepo();
  let offCalls = 0;
  const off = { getByBarcode: async () => {
    offCalls += 1;
    await new Promise((r) => setTimeout(r, 10));
    return { source: "open_food_facts", sourceId: "5449000000996", barcode: "5449000000996", name_en: "X", calories: 1, protein_g: 0, carbs_g: 0, fat_g: 0, imageUrl: null, rawPayload: {} };
  } };
  const normalizer = { normalizeFoodRecord: (x) => ({ name_zh: null, name_en: x.name_en, normalized_name: "x", brand_name: null, description: null, search_keywords: [], nutrition: { calories: 1, protein_g: 0, carbs_g: 0, fat_g: 0 }, auto_tags: [] }) };
  const svc = createFoodBarcodeService({ repository: repo, openFoodFacts: off, normalizer, imageService: null, imageSyncEnabled: false });
  await Promise.all([svc.lookup("5449000000996"), svc.lookup("5449000000996"), svc.lookup("5449000000996")]);
  assert.equal(offCalls, 1, "OFF should be called once under lock");
  assert.equal(repo.calls.upsert, 1);
});
