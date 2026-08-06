import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("./0037_food_visual_type.sql", import.meta.url);

test("food visual type migration keeps the override optional and closed", async () => {
  const sql = await readFile(migrationUrl, "utf8");
  assert.match(sql, /add column if not exists visual_type text/i);
  assert.match(sql, /visual_type is null or visual_type in/i);
  assert.match(sql, /'drink_powder'/);
  assert.match(sql, /'alcohol_bottle'/);
  assert.match(sql, /'unknown'/);
});
