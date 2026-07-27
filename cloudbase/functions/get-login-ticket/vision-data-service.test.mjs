import assert from "node:assert/strict";
import test from "node:test";

import { createVisionDataService } from "./vision-data-service.cjs";

test("uploads, recognizes, and persists an authenticated user's food image", async () => {
  const writes = [];
  const db = { from(table) { return { insert(payload) { writes.push({ table, payload }); return { select: () => ({ single: async () => ({ data: { id: `${table}-1`, ...payload }, error: null }) }) }; } }; } };
  const service = createVisionDataService({
    db,
    uploadImage: async () => ({ cloudPath: "cloud://env/food-images/user-1/image.jpg", imageUrl: "https://example.com/temp.jpg" }),
    analyze: async () => ({ mealName: "鸡胸肉", mealType: "lunch", confidence: 0.9, advice: "高蛋白", items: [{ name: "鸡胸肉", quantityG: 100, caloriesPer100g: 133, proteinPer100g: 24, carbsPer100g: 0, fatPer100g: 3 }] }),
    model: "vita-video-3.0",
  });

  const result = await service.analyzeImage("user-1", {
    clientRequestId: "11111111-1111-4111-8111-111111111111",
    contentType: "image/jpeg",
    imageBase64: Buffer.from([0xff, 0xd8, 0xff, 0xdb]).toString("base64"),
  });

  assert.equal(result.mealName, "鸡胸肉");
  assert.equal(result.imagePath, "cloud://env/food-images/user-1/image.jpg");
  assert.deepEqual(writes.map((write) => write.table), ["uploaded_assets", "ai_analysis"]);
  assert.equal(writes[0].payload.user_id, "user-1");
});

test("attaches DeepSeek evaluation when evaluateMeal is provided", async () => {
  const db = { from() { return { insert() { return { select: () => ({ single: async () => ({ data: { id: "a-1" }, error: null }) }) }; } }; } };
  const service = createVisionDataService({
    db,
    uploadImage: async () => ({ cloudPath: "x.jpg", imageUrl: "https://example.com/x.jpg" }),
    analyze: async () => ({ mealName: "沙拉", mealType: "lunch", confidence: 0.9, advice: "健康", items: [{ name: "蔬菜", quantityG: 100, caloriesPer100g: 50, proteinPer100g: 2, carbsPer100g: 10, fatPer100g: 1 }] }),
    evaluateMeal: async () => "这餐很清爽",
  });

  const result = await service.analyzeImage("user-1", {
    clientRequestId: "11111111-1111-4111-8111-111111111111",
    contentType: "image/png",
    imageBase64: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
  });

  assert.equal(result.evaluation, "这餐很清爽");
  assert.equal(result.imageUrl, "https://example.com/x.jpg");
});

test("falls back to local evaluation and omits data-URL imageUrl", async () => {
  const db = { from() { return { insert() { return { select: () => ({ single: async () => ({ data: { id: "a-1" }, error: null }) }) }; } }; } };
  const service = createVisionDataService({
    db,
    uploadImage: async () => ({ cloudPath: null, imageUrl: "data:image/jpeg;base64,/9j/aa" }),
    analyze: async () => ({ mealName: "蛋挞", mealType: "snack", confidence: 0.9, advice: "适量", items: [{ name: "蛋挞", quantityG: 50, caloriesPer100g: 300, proteinPer100g: 5, carbsPer100g: 30, fatPer100g: 15 }] }),
    evaluateMeal: async () => { await new Promise((r) => setTimeout(r, 50)); return null; },
  });

  const result = await service.analyzeImage("user-1", {
    clientRequestId: "11111111-1111-4111-8111-111111111111",
    contentType: "image/jpeg",
    imageBase64: Buffer.from([0xff, 0xd8, 0xff, 0xdb]).toString("base64"),
  });

  assert.equal(result.evaluation, "这餐吃得不错");
  assert.equal(result.imageUrl, null);
});

test("accepts GIF and WebP content types", async () => {
  const db = { from() { return { insert() { return { select: () => ({ single: async () => ({ data: { id: "a-1" }, error: null }) }) }; } }; } };
  const service = createVisionDataService({
    db,
    uploadImage: async () => ({ cloudPath: "x.gif", imageUrl: "https://example.com/x.gif" }),
    analyze: async () => ({ mealName: "test", mealType: "snack", confidence: 0.8, advice: "ok", items: [{ name: "x", quantityG: 50, caloriesPer100g: 100, proteinPer100g: 5, carbsPer100g: 20, fatPer100g: 2 }] }),
  });

  const result = await service.analyzeImage("user-1", {
    clientRequestId: "11111111-1111-4111-8111-111111111111",
    contentType: "image/gif",
    imageBase64: Buffer.from("GIF89a").toString("base64"),
  });

  assert.equal(result.mealName, "test");
});

test("fails explicitly when a visual provider is not configured", async () => {
  const service = createVisionDataService({ db: { from() {} }, uploadImage: async () => ({}), analyze: null });
  await assert.rejects(() => service.analyzeImage("user-1", {}), (error) => error.code === "VISION_SERVICE_NOT_CONFIGURED");
});

test("backfills per-100g nutrition from USDA catalog when backfillNutrition is provided", async () => {
  const db = { from() { return { insert() { return { select: () => ({ single: async () => ({ data: { id: "a-1" }, error: null }) }) }; } }; } };
  const service = createVisionDataService({
    db,
    uploadImage: async () => ({ cloudPath: "x.jpg", imageUrl: "https://example.com/x.jpg" }),
    analyze: async () => ({ mealName: "鸡胸肉沙拉", mealType: "lunch", confidence: 0.9, advice: "ok", items: [
      { name: "鸡胸肉", quantityG: 120, caloriesPer100g: 100, proteinPer100g: 20, carbsPer100g: 1, fatPer100g: 2 },
      { name: "生菜", quantityG: 80, caloriesPer100g: 30, proteinPer100g: 1, carbsPer100g: 6, fatPer100g: 0 },
    ] }),
    backfillNutrition: async (items) => items.map((item, idx) => idx === 0
      ? { ...item, caloriesPer100g: 165, proteinPer100g: 31, carbsPer100g: 0, fatPer100g: 3.6, nutritionSource: "usda" }
      : { ...item, nutritionSource: "ai_estimate" }),
  });

  const result = await service.analyzeImage("user-1", {
    clientRequestId: "11111111-1111-4111-8111-111111111111",
    contentType: "image/jpeg",
    imageBase64: Buffer.from([0xff, 0xd8, 0xff, 0xdb]).toString("base64"),
  });

  assert.equal(result.nutritionSource, "mixed");
  assert.equal(result.items[0].nutritionSource, "usda");
  assert.equal(result.items[0].caloriesPer100g, 165);
  assert.equal(result.items[1].nutritionSource, "ai_estimate");
});
