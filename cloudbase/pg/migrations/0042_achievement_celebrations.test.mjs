import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("persists server-confirmed achievement celebration state without replaying old history", async () => {
  const sql = await readFile(new URL("./0042_achievement_celebrations.sql", import.meta.url), "utf8");
  assert.match(sql, /add column if not exists celebrated_at timestamptz/i);
  assert.match(sql, /where celebrated_at is null/i);
  assert.match(sql, /completed_at < now\(\) - interval '2 hours'/i);
});
