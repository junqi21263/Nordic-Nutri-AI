import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const sql = fs.readFileSync(path.join(here, "0024_correct_shellfish_taxonomy.sql"), "utf8");

test("moves the confirmed whelk records from marine fish to shellfish without deleting food data", () => {
  assert.match(sql, /drop constraint if exists foods_visual_profile_key_check/i);
  assert.match(sql, /cooked_grilled/);
  assert.match(sql, /add constraint foods_visual_profile_key_check/i);
  assert.match(sql, /seafood\.shellfish/);
  assert.match(sql, /85b19747-cdda-4e86-9a27-4be914b1260e/);
  assert.match(sql, /13cca128-f966-420a-97f2-326dc280c214/);
  assert.match(sql, /ea1aa11b-a436-4366-9266-0ede83635dc4/);
  assert.doesNotMatch(sql, /\bdelete\b/i);
});
