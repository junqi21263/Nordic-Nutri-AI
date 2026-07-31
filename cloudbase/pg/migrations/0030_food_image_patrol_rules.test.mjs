import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("./0030_food_image_patrol_rules.sql", import.meta.url), "utf8");

test("0030 creates food_image_patrol_rules with unique category+profile", () => {
  assert.match(migration, /create table if not exists public\.food_image_patrol_rules/i);
  assert.match(migration, /unique \(category_id, visual_profile_key\)/i);
  assert.match(migration, /batch_size between 1 and 100/i);
  assert.match(migration, /food_image_patrol_rules: server only/);
});
