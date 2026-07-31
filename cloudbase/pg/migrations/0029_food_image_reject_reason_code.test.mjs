import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const dir = dirname(fileURLToPath(import.meta.url));

test("0029 adds reject_reason_code with allowed values", async () => {
  const sql = await readFile(join(dir, "0029_food_image_reject_reason_code.sql"), "utf8");
  assert.match(sql, /reject_reason_code/);
  assert.match(sql, /wrong_identity/);
  assert.match(sql, /wrong_doneness/);
  assert.match(sql, /extra_foods/);
});
