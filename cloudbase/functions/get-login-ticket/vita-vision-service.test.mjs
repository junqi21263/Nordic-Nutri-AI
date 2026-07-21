import assert from "node:assert/strict";
import test from "node:test";

import { createVitaVisionService } from "./vita-vision-service.cjs";

test("validates a structured food-image recognition response", async () => {
  const analyze = createVitaVisionService({
    apiKey: "test-key",
    requestCompletion: async ({ imageUrl }) => ({
      mealName: "鸡胸肉米饭",
      mealType: "lunch",
      confidence: 0.92,
      advice: "蛋白质充足。",
      imageUrl,
      items: [{ name: "鸡胸肉", quantityG: 150, caloriesPer100g: 133, proteinPer100g: 24, carbsPer100g: 0, fatPer100g: 3 }],
    }),
  });

  const result = await analyze({ imageUrl: "https://example.com/meal.jpg" });
  assert.equal(result.mealName, "鸡胸肉米饭");
  assert.equal(result.items[0].proteinPer100g, 24);
});

test("rejects invalid image URLs before calling the provider", async () => {
  let called = false;
  const analyze = createVitaVisionService({ apiKey: "test-key", requestCompletion: async () => { called = true; return {}; } });
  await assert.rejects(() => analyze({ imageUrl: "wxfile://local" }), /图片无效/);
  assert.equal(called, false);
});
