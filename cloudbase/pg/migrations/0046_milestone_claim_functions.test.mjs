import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("milestone claim migration locks one pending event and expires stale claims", async () => {
  const sql = await readFile(new URL("./0046_milestone_claim_functions.sql", import.meta.url), "utf8");
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /make_interval\(secs => p_ttl_seconds\)/i);
  assert.match(sql, /presentation_claim_token = v_token/i);
  assert.match(sql, /event\.status = 'pending'/i);
  assert.match(sql, /presentation_snapshot = p_snapshot/i);
});
