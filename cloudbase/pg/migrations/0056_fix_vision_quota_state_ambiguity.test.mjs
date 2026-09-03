import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("terminal vision quota RPCs qualify state references", async () => {
  const sql = await readFile(new URL("./0056_fix_vision_quota_state_ambiguity.sql", import.meta.url), "utf8");
  assert.match(sql, /update private\.vision_quota_reservations as q/i);
  assert.match(sql, /q\.state in \('reserved', 'committed'\)/i);
  assert.match(sql, /q\.state = 'reserved'/i);
});
