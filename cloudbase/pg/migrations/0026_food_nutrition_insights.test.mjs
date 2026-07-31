import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("./0026_food_nutrition_insights.sql", import.meta.url), "utf8");

test("food nutrition insights are unique per food and server-owned", () => {
  assert.match(migration, /create table if not exists public\.food_nutrition_insights/i);
  assert.match(migration, /unique \(food_id\)/i);
  assert.match(migration, /context_hash char\(64\)/i);
  assert.match(migration, /provider in \('cloudbase', 'deepseek', 'hunyuan-exp', 'rule_v1'\)/i);
  assert.match(migration, /food nutrition insights: server only/i);
});
