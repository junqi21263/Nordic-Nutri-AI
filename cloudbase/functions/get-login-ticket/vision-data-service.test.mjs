import assert from "node:assert/strict";
import test from "node:test";

import { createVisionDataService } from "./vision-data-service.cjs";

test("uploads, recognizes, and persists an authenticated user's food image", async () => {
  const writes = [];
  const traces = [];
  const db = { from(table) { return { insert(payload) { writes.push({ table, payload }); return { select: () => ({ single: async () => ({ data: { id: `${table}-1`, ...payload }, error: null }) }) }; } }; } };
  const service = createVisionDataService({
    db,
    uploadImage: async () => ({ cloudPath: "cloud://env/food-images/user-1/image.jpg", imageUrl: "https://example.com/temp.jpg" }),
    analyze: async () => ({ mealName: "鸡胸肉", mealType: "lunch", confidence: 0.9, advice: "高蛋白", items: [{ name: "鸡胸肉", quantityG: 100, caloriesPer100g: 133, proteinPer100g: 24, carbsPer100g: 0, fatPer100g: 3 }] }),
    model: "vita-video-3.0",
    recordTrace: async (...args) => { traces.push(args); },
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
  assert.equal(traces.length, 1);
  assert.equal(traces[0][0], "vision_recognition_trace");
  assert.equal(traces[0][2].clientRequestId, "11111111-1111-4111-8111-111111111111");
  assert.equal(traces[0][2].analysisId, "ai_analysis-1");
  assert.match(traces[0][2].imageSha256, /^[0-9a-f]{64}$/);
  assert.equal(traces[0][2].persistence.success, true);
});

test("trace write failures never fail an otherwise successful analysis", async () => {
  const db = { from() { return { insert() { return { select: () => ({ single: async () => ({ data: { id: "a-1" }, error: null }) }) }; } }; } };
  const service = createVisionDataService({
    db,
    uploadImage: async () => ({ cloudPath: "x.jpg", imageUrl: "https://example.com/x.jpg" }),
    analyze: async () => ({ mealName: "沙拉", mealType: "lunch", confidence: 0.9, advice: "健康", items: [{ name: "蔬菜", quantityG: 100, caloriesPer100g: 50, proteinPer100g: 2, carbsPer100g: 10, fatPer100g: 1 }] }),
    recordTrace: async () => { throw new Error("observability unavailable"); },
  });

  const result = await service.analyzeImage("user-1", {
    clientRequestId: "11111111-1111-4111-8111-111111111111",
    contentType: "image/jpeg",
    imageBase64: Buffer.from([0xff, 0xd8, 0xff, 0xdb]).toString("base64"),
  });

  assert.equal(result.mealName, "沙拉");
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
  const writes = [];
  const db = {
    from(table) {
      return {
        insert(payload) {
          writes.push({ table, payload });
          return { select: () => ({ single: async () => ({ data: { id: "a-1", ...payload }, error: null }) }) };
        },
      };
    },
  };
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
  assert.equal(result.imagePath, null);
  assert.equal(writes.some((write) => write.table === "uploaded_assets"), false);
  assert.equal(writes.find((write) => write.table === "ai_analysis")?.payload.image_path, null);
});

test("accepts WebP content type and rejects GIF", async () => {
  const db = { from() { return { insert() { return { select: () => ({ single: async () => ({ data: { id: "a-1" }, error: null }) }) }; } }; } };
  const service = createVisionDataService({
    db,
    uploadImage: async () => ({ cloudPath: "cloud://env/x.webp", imageUrl: "https://example.com/x.webp" }),
    analyze: async () => ({ mealName: "test", mealType: "snack", confidence: 0.8, advice: "ok", items: [{ name: "x", quantityG: 50, caloriesPer100g: 100, proteinPer100g: 5, carbsPer100g: 20, fatPer100g: 2 }] }),
  });

  const result = await service.analyzeImage("user-1", {
    clientRequestId: "11111111-1111-4111-8111-111111111111",
    contentType: "image/webp",
    imageBase64: Buffer.from("RIFF....WEBP").toString("base64"),
  });
  assert.equal(result.mealName, "test");

  await assert.rejects(
    () => service.analyzeImage("user-1", {
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      contentType: "image/gif",
      imageBase64: Buffer.from("GIF89a").toString("base64"),
    }),
    (error) => error.code === "VISION_IMAGE_INVALID",
  );
});

test("fails explicitly when a visual provider is not configured", async () => {
  const service = createVisionDataService({ db: { from() {} }, uploadImage: async () => ({}), analyze: null });
  await assert.rejects(() => service.analyzeImage("user-1", {}), (error) => error.code === "VISION_SERVICE_NOT_CONFIGURED");
});

test("skips upload and analyze when assertImageSafe rejects", async () => {
  let uploaded = 0;
  let analyzed = 0;
  const service = createVisionDataService({
    db: { from() { return { insert() { return { select: () => ({ single: async () => ({ data: { id: "a-1" }, error: null }) }) }; } }; } },
    uploadImage: async () => {
      uploaded += 1;
      return { cloudPath: "x.jpg", imageUrl: "https://example.com/x.jpg" };
    },
    analyze: async () => {
      analyzed += 1;
      return { mealName: "x", mealType: "lunch", confidence: 0.9, advice: "ok", items: [] };
    },
    assertImageSafe: async () => {
      const error = new Error("图片含有违规内容，请更换后重试");
      error.code = "VISION_CONTENT_BLOCKED";
      throw error;
    },
  });

  await assert.rejects(
    () => service.analyzeImage("user-1", {
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      contentType: "image/jpeg",
      imageBase64: Buffer.from([0xff, 0xd8, 0xff, 0xdb]).toString("base64"),
    }),
    (error) => error.code === "VISION_CONTENT_BLOCKED",
  );
  assert.equal(uploaded, 0);
  assert.equal(analyzed, 0);
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

test("does not return a synthetic analysisId when persistence fails", async () => {
  const traces = [];
  const service = createVisionDataService({
    db: { from() { return { insert() { throw new Error("database unavailable"); } }; } },
    uploadImage: async () => ({ cloudPath: "cloud://env/x.jpg", imageUrl: "https://example.com/x.jpg" }),
    analyze: async () => ({ mealName: "米饭", mealType: "lunch", confidence: 0.9, advice: "ok", items: [{ name: "米饭", quantityG: 150, caloriesPer100g: 130, proteinPer100g: 2.7, carbsPer100g: 28, fatPer100g: 0.3 }] }),
    recordTrace: async (...args) => { traces.push(args); },
  });

  await assert.rejects(
    () => service.analyzeImage("user-1", {
      clientRequestId: "11111111-1111-4111-8111-111111111111",
      contentType: "image/jpeg",
      imageBase64: Buffer.from([0xff, 0xd8, 0xff, 0xdb]).toString("base64"),
    }),
    (error) => error.code === "VISION_PERSISTENCE_FAILED",
  );
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(traces.length, 1);
  assert.equal(traces[0][2].analysisId, null);
  assert.equal(traces[0][2].persistence.success, false);
});
