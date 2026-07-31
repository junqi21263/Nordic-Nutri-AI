import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("./0031_food_image_patrol_interval.sql", import.meta.url), "utf8");

test("0031 adds interval_minutes with 30–1440 bounds and default 60", () => {
  assert.match(migration, /add column if not exists interval_minutes/i);
  assert.match(migration, /default 60/i);
  assert.match(migration, /interval_minutes between 30 and 1440/i);
});
