import assert from "node:assert/strict";
import test from "node:test";

import { createMealDataService, normalizeStoredImagePath } from "./meal-data-service.cjs";

test("rejects oversized HTTPS temp URLs for image_path storage", () => {
  assert.equal(normalizeStoredImagePath("cloud://env/food-images/a.jpg"), "cloud://env/food-images/a.jpg");
  assert.equal(normalizeStoredImagePath(`https://example.com/${"x".repeat(500)}`), null);
  assert.equal(normalizeStoredImagePath("https://cdn.example.com/meal.jpg"), "https://cdn.example.com/meal.jpg");
});

function createDb({ meals = [], items = [] } = {}) {
  const calls = [];
  const db = {
    from(table) {
      const filters = [];
      let inFilter = null;
      const finalize = async () => {
        if (table === "meal_records") return { data: meals, error: null };
        if (table === "meal_items") {
          const ids = inFilter?.[1] === "meal_record_id" ? inFilter[2] : [];
          return { data: items.filter((item) => ids.includes(item.meal_record_id)), error: null };
        }
        return { data: [], error: null };
      };
      const chain = {
        eq(column, value) { filters.push([column, value]); return chain; },
        is(column, value) { filters.push([column, value]); return chain; },
        gte(column, value) { filters.push([column, value]); return chain; },
        lt(column, value) { filters.push([column, value]); return chain; },
        in(column, value) {
          inFilter = ["in", column, value];
          calls.push({ table, operation: "in", column, value });
          return chain;
        },
        order() { return chain; },
        select() { return chain; },
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: { id: `${table}-1` }, error: null }),
        then(resolve, reject) {
          return finalize().then(resolve, reject);
        },
      };
      return {
        select() { return chain; },
        insert(payload) {
          calls.push({ table, operation: "insert", payload });
          return { select: () => ({ single: async () => ({ data: { id: `${table}-1`, ...payload }, error: null }) }) };
        },
        update(payload) {
          calls.push({ table, operation: "update", payload, filters });
          return chain;
        },
      };
    },
  };
  return { db, calls };
}

const validMeal = {
  clientRequestId: "11111111-1111-4111-8111-111111111111",
  mealType: "lunch",
  name: "鸡胸肉沙拉",
  recordedAt: "2026-07-20T12:00:00.000Z",
  items: [{ name: "鸡胸肉", quantityG: 150, caloriesPer100g: 133, proteinPer100g: 24, carbsPer100g: 0, fatPer100g: 3 }],
};

test("creates a meal and items under the authenticated product user", async () => {
  const { db, calls } = createDb();
  const service = createMealDataService({ db });

  const meal = await service.createMeal("user-1", validMeal);

  assert.equal(meal.userId, "user-1");
  assert.equal(meal.items[0].name, "鸡胸肉");
  assert.deepEqual(calls.map((call) => call.table), ["meal_records", "meal_items"]);
  assert.equal(calls[0].payload.user_id, "user-1");
  assert.equal(calls[1].payload[0].meal_record_id, "meal_records-1");
  assert.equal(calls[1].payload[0].food_id, null);
});

test("does not auto-create or link catalog foods when saving a meal", async () => {
  const { db, calls } = createDb();
  let resolveCalls = 0;
  const service = createMealDataService({
    db,
    resolveFoodLinks: async () => {
      resolveCalls += 1;
      return [{ foodId: "food-should-not-be-used", imageUrl: "https://example.com/x.jpg" }];
    },
  });

  await service.createMeal("user-1", validMeal);

  assert.equal(resolveCalls, 0);
  assert.equal(calls[1].payload[0].food_id, null);
});

test("rejects a meal before persistence when its client request or nutrients are invalid", async () => {
  const { db, calls } = createDb();
  const service = createMealDataService({ db });

  await assert.rejects(
    () => service.createMeal("user-1", { ...validMeal, clientRequestId: "invalid", items: [{ ...validMeal.items[0], quantityG: 0 }] }),
    /无效/,
  );
  assert.deepEqual(calls, []);
});

test("soft-deletes only the authenticated user's meal", async () => {
  const { db, calls } = createDb();
  const service = createMealDataService({ db });

  await service.deleteMeal("user-1", "22222222-2222-4222-8222-222222222222");

  assert.deepEqual(calls[0].filters, [
    ["id", "22222222-2222-4222-8222-222222222222"],
    ["user_id", "user-1"],
    ["deleted_at", null],
  ]);
});

test("createMeal does not await DeepSeek meal insight generation", async () => {
  const { db } = createDb();
  let generateCalls = 0;
  const service = createMealDataService({
    db,
    generateMealInsight: async () => {
      generateCalls += 1;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return "后台洞察";
    },
  });

  const started = Date.now();
  const meal = await service.createMeal("user-1", validMeal);
  const elapsed = Date.now() - started;

  assert.equal(meal.insight, null);
  assert.ok(elapsed < 40);
  await new Promise((resolve) => setTimeout(resolve, 80));
  assert.equal(generateCalls, 1);
});

test("lists a date range with one meal_items batch query", async () => {
  const meals = [
    {
      id: "meal-a",
      user_id: "user-1",
      analysis_id: null,
      client_request_id: null,
      meal_type: "lunch",
      name: "番茄炒蛋",
      recorded_at: "2026-07-20T12:00:00.000Z",
      is_favorite: false,
      image_path: null,
      insight: null,
      calories_kcal: 300,
      protein_g: 20,
      carbs_g: 10,
      fat_g: 18,
    },
    {
      id: "meal-b",
      user_id: "user-1",
      analysis_id: null,
      client_request_id: null,
      meal_type: "dinner",
      name: "鱼香茄子",
      recorded_at: "2026-07-21T18:00:00.000Z",
      is_favorite: false,
      image_path: null,
      insight: null,
      calories_kcal: 400,
      protein_g: 12,
      carbs_g: 40,
      fat_g: 20,
    },
  ];
  const items = [
    {
      id: "item-a",
      meal_record_id: "meal-a",
      name: "鸡蛋",
      confirmed_quantity_g: 100,
      ai_quantity_g: 100,
      calories_per_100g: 140,
      protein_g_per_100g: 13,
      carbs_g_per_100g: 1,
      fat_g_per_100g: 9,
      food_id: null,
      created_at: "2026-07-20T12:00:00.000Z",
    },
    {
      id: "item-b",
      meal_record_id: "meal-b",
      name: "茄子",
      confirmed_quantity_g: 200,
      ai_quantity_g: 200,
      calories_per_100g: 50,
      protein_g_per_100g: 1,
      carbs_g_per_100g: 8,
      fat_g_per_100g: 2,
      food_id: null,
      created_at: "2026-07-21T18:00:00.000Z",
    },
  ];
  const { db, calls } = createDb({ meals, items });
  const service = createMealDataService({ db });

  const listed = await service.listMealsRange("user-1", "2026-07-20", "2026-07-21");

  assert.equal(listed.length, 2);
  assert.equal(listed[0].name, "番茄炒蛋");
  assert.equal(listed[0].items[0].name, "鸡蛋");
  assert.equal(listed[1].items[0].name, "茄子");
  assert.equal(calls.filter((call) => call.operation === "in").length, 1);
  assert.deepEqual(calls.find((call) => call.operation === "in").value, ["meal-a", "meal-b"]);

  let resolveCalls = 0;
  const withImages = createMealDataService({
    db: createDb({ meals, items }).db,
    resolveImageUrl: async () => {
      resolveCalls += 1;
      return "https://example.com/x.jpg";
    },
  });
  await withImages.listMealsRange("user-1", "2026-07-20", "2026-07-21", { resolveImages: false });
  assert.equal(resolveCalls, 0);
});
