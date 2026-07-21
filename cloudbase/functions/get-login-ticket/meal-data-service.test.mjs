import assert from "node:assert/strict";
import test from "node:test";

import { createMealDataService } from "./meal-data-service.cjs";

function createDb() {
  const calls = [];
  const db = {
    from(table) {
      const filters = [];
      const chain = {
        eq(column, value) { filters.push([column, value]); return chain; },
        is(column, value) { filters.push([column, value]); return chain; },
        gte(column, value) { filters.push([column, value]); return chain; },
        lt(column, value) { filters.push([column, value]); return chain; },
        order() { return chain; },
        select() { return chain; },
        maybeSingle: async () => ({ data: null, error: null }),
        single: async () => ({ data: { id: `${table}-1` }, error: null }),
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
