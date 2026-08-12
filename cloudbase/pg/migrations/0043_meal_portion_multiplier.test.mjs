import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("./0043_meal_portion_multiplier.sql", import.meta.url), "utf8");

assert.match(sql, /alter table public\.meal_records/i);
assert.match(sql, /add column if not exists portion_multiplier numeric\(3, 2\)/i);
assert.match(sql, /portion_multiplier in \(0\.25, 0\.50, 0\.75, 1\.00, 1\.25, 1\.50, 1\.75, 2\.00\)/i);
