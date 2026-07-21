import assert from "node:assert/strict";
import test from "node:test";

import { createVisionDataService } from "./vision-data-service.cjs";

test("uploads, recognizes, and persists an authenticated user's food image", async () => {
  const writes = [];
  const db = { from(table) { return { insert(payload) { writes.push({ table, payload }); return { select: () => ({ single: async () => ({ data: { id: `${table}-1`, ...payload }, error: null }) }) }; } }; } };
  const service = createVisionDataService({
    db,
    uploadImage: async () => ({ cloudPath: "food-images/user-1/image.jpg", imageUrl: "https://example.com/temp.jpg" }),
    analyze: async () => ({ mealName: "鸡胸肉", mealType: "lunch", confidence: 0.9, advice: "高蛋白", items: [{ name: "鸡胸肉", quantityG: 100, caloriesPer100g: 133, proteinPer100g: 24, carbsPer100g: 0, fatPer100g: 3 }] }),
    model: "vita-video-3.0",
  });

  const result = await service.analyzeImage("user-1", {
    clientRequestId: "11111111-1111-4111-8111-111111111111",
    contentType: "image/jpeg",
    imageBase64: Buffer.from([0xff, 0xd8, 0xff, 0xdb]).toString("base64"),
  });

  assert.equal(result.mealName, "鸡胸肉");
  assert.deepEqual(writes.map((write) => write.table), ["uploaded_assets", "ai_analysis"]);
  assert.equal(writes[0].payload.user_id, "user-1");
});

test("fails explicitly when a visual provider is not configured", async () => {
  const service = createVisionDataService({ db: { from() {} }, uploadImage: async () => ({}), analyze: null });
  await assert.rejects(() => service.analyzeImage("user-1", {}), (error) => error.code === "VISION_SERVICE_NOT_CONFIGURED");
});
