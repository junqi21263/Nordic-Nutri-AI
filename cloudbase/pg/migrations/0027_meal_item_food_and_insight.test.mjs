import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("./0027_meal_item_food_and_insight.sql", import.meta.url), "utf8");

test("meal records cache insight and meal items link to foods", () => {
  assert.match(migration, /alter table public\.meal_records/i);
  assert.match(migration, /add column if not exists insight text/i);
  assert.match(migration, /alter table public\.meal_items/i);
  assert.match(migration, /add column if not exists food_id uuid references public\.foods\(id\)/i);
  assert.match(migration, /meal_items_food_id_idx/i);
});
