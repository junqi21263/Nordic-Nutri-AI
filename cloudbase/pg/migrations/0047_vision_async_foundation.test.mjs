import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const sql = await readFile(new URL("./0047_vision_async_foundation.sql", import.meta.url), "utf8");
const rollback = await readFile(new URL("./0047_vision_async_foundation.rollback.sql", import.meta.url), "utf8");
const readback = await readFile(new URL("./0047_vision_async_foundation.readback.sql", import.meta.url), "utf8");

test("vision foundation migration canonicalizes legacy status with a marked boundary", () => {
  assert.match(sql, /succeeded.*completed/i);
  assert.match(sql, /legacy_status_backfill/i);
  assert.match(sql, /uploaded_assets/i);
  assert.match(sql, /analysis_id uuid/i);
  assert.match(sql, /reservation_expires_at/i);
});

test("vision foundation migration defines atomic create and ownership RPCs", () => {
  assert.match(sql, /create_vision_analysis/i);
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /execution_owner/i);
  assert.match(sql, /dispatch_state/i);
  assert.match(sql, /resume_stage/i);
  assert.match(sql, /lease_until/i);
  assert.match(sql, /deadline_at/i);
});

test("rollback is bounded to the explicit legacy backfill marker", () => {
  assert.match(rollback, /legacy_status_backfill/i);
  assert.match(rollback, /succeeded/i);
  assert.doesNotMatch(rollback, /where\s+status\s*=\s*'completed'/i);
});

test("readback is metadata-only and covers the foundation surface", () => {
  assert.match(readback, /information_schema/i);
  assert.match(readback, /create_vision_analysis/i);
  assert.match(readback, /legacy_status_backfill/i);
  assert.doesNotMatch(readback, /\b(insert|update|delete|alter|drop)\b/i);
});
