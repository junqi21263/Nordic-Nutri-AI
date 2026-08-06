import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeFoodName,
  createDeepseekFoodClassifyService,
  createDeepseekMealInsightService,
  createMealFoodLinkService,
} from "./meal-food-link-service.cjs";

test("normalizeFoodName collapses spaces and full-width characters", () => {
  assert.equal(normalizeFoodName(" 炒 蛋 "), "炒蛋");
  assert.equal(normalizeFoodName("ＡＰＰＬＥ"), "apple");
});

test("classify service returns a known category code", async () => {
  const classify = createDeepseekFoodClassifyService({
    requestCompletion: async () => ({ categoryCode: "egg" }),
  });
  assert.equal((await classify({ name: "炒蛋", macros: {} })).categoryCode, "egg");
});

test("classify service falls back to other on invalid codes", async () => {
  const classify = createDeepseekFoodClassifyService({
    requestCompletion: async () => ({ categoryCode: "dessert" }),
  });
  assert.equal((await classify({ name: "甜品", macros: {} })).categoryCode, "other");
});

test("meal insight service returns trimmed insight text", async () => {
  const insight = createDeepseekMealInsightService({
    requestCompletion: async () => ({ insight: " 蛋白质充足，下一餐可补充蔬菜。 " }),
  });
  const result = await insight({ mealName: "英式早餐", items: [] });
  assert.equal(result.insight, "蛋白质充足，下一餐可补充蔬菜。");
});

test("resolveItems reuses an existing food by normalized name", async () => {
  const calls = [];
  const db = {
    from(table) {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        in() { return chain; },
        limit() { return chain; },
        upsert() { return chain; },
        maybeSingle: async () => {
          calls.push(table);
          if (table === "foods") return { data: { id: "food-1", normalized_name: "炒蛋" }, error: null };
          return { data: null, error: null };
        },
        then(resolve, reject) {
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
  const service = createMealFoodLinkService({
    db,
    classifyFoodCategory: async () => "egg",
  });
  const items = await service.resolveItems([
    { name: "炒蛋", quantityG: 80, caloriesPer100g: 165, proteinPer100g: 13, carbsPer100g: 1, fatPer100g: 12 },
  ]);
  assert.equal(items[0].foodId, "food-1");
  assert.ok(!calls.includes("food_categories"));
});

test("resolveItems creates ai_scan food when missing", async () => {
  let foodLookups = 0;
  const inserts = [];
  const db = {
    from(table) {
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        in() { return chain; },
        limit() { return chain; },
        upsert(payload) {
          inserts.push({ table, payload });
          return chain;
        },
        maybeSingle: async () => {
          if (table === "foods" && inserts.length === 0) {
            foodLookups += 1;
            return { data: null, error: null };
          }
          if (table === "food_categories") return { data: { id: "cat-egg", code: "egg" }, error: null };
          if (table === "foods") return { data: { id: "food-new", ...inserts.at(-1)?.payload }, error: null };
          return { data: null, error: null };
        },
        then(resolve, reject) {
          return Promise.resolve({ data: [], error: null }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
  const service = createMealFoodLinkService({
    db,
    classifyFoodCategory: async () => "egg",
    enqueueFoodImage: async () => {},
  });
  const items = await service.resolveItems([
    { name: "炒蛋", quantityG: 80, caloriesPer100g: 165, proteinPer100g: 13, carbsPer100g: 1, fatPer100g: 12 },
  ]);
  assert.equal(items[0].foodId, "food-new");
  assert.equal(inserts[0].table, "foods");
  assert.equal(inserts[0].payload.source, "ai_scan");
  assert.ok(foodLookups >= 1);
});
