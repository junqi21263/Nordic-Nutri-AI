import assert from "node:assert/strict";
import test from "node:test";

import { createDeepseekMealService } from "./deepseek-meal-service.cjs";

test("returns a bounded DeepSeek meal estimate for validated ingredients", async () => {
  const requests = [];
  const analyze = createDeepseekMealService({
    apiKey: "test-key",
    model: "deepseek-v4-flash",
    requestCompletion: async (request) => {
      requests.push(request);
      return {
        mealName: "鸡胸肉沙拉",
        advice: "蛋白质充足，可搭配主食。",
        items: [{
          name: "鸡胸肉", quantityG: 150, caloriesPer100g: 133,
          proteinPer100g: 24, carbsPer100g: 0, fatPer100g: 3,
        }],
      };
    },
  });

  const result = await analyze({ items: [{ name: "鸡胸肉", quantityG: 150 }] });

  assert.equal(result.mealName, "鸡胸肉沙拉");
  assert.equal(result.items[0].proteinPer100g, 24);
  assert.deepEqual(requests, [{ items: [{ name: "鸡胸肉", quantityG: 150 }] }]);
});

test("rejects invalid requested ingredients before calling DeepSeek", async () => {
  let called = false;
  const analyze = createDeepseekMealService({
    apiKey: "test-key",
    requestCompletion: async () => { called = true; return {}; },
  });

  await assert.rejects(
    () => analyze({ items: [{ name: "", quantityG: 5000 }] }),
    /无效/,
  );
  assert.equal(called, false);
});

test("rejects structurally invalid model output", async () => {
  const analyze = createDeepseekMealService({
    apiKey: "test-key",
    requestCompletion: async () => ({ mealName: "午餐", items: [{ name: "米饭", quantityG: 100 }] }),
  });

  await assert.rejects(
    () => analyze({ items: [{ name: "米饭", quantityG: 100 }] }),
    /分析结果无效/,
  );
});

test("uses the supported V4 Flash model in non-thinking JSON mode by default", async () => {
  let body;
  const analyze = createDeepseekMealService({
    apiKey: "test-key",
    fetchImpl: async (_url, options) => {
      body = JSON.parse(options.body);
      return {
        ok: true,
        json: async () => ({
          choices: [{ message: { content: JSON.stringify({
            mealName: "米饭",
            advice: "",
            items: [{ name: "米饭", quantityG: 100, caloriesPer100g: 116, proteinPer100g: 2.6, carbsPer100g: 25.9, fatPer100g: 0.3 }],
          }) } }],
        }),
      };
    },
  });

  await analyze({ items: [{ name: "米饭", quantityG: 100 }] });
  assert.equal(body.model, "deepseek-v4-flash");
  assert.deepEqual(body.thinking, { type: "disabled" });
  assert.deepEqual(body.response_format, { type: "json_object" });
});
