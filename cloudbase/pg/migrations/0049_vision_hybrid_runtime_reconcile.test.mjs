import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("./0049_vision_hybrid_runtime_reconcile.sql", import.meta.url), "utf8");
const readback = await readFile(new URL("./0049_vision_hybrid_runtime_reconcile.readback.sql", import.meta.url), "utf8");
const rollback = await readFile(new URL("./0049_vision_hybrid_runtime_reconcile.rollback.sql", import.meta.url), "utf8");

test("0049 is an idempotent, data-preserving reconciliation", () => {
  assert.match(sql, /add column if not exists/i);
  assert.match(sql, /create index if not exists/i);
  assert.match(sql, /create or replace function public\.queue_vision_analysis/i);
  assert.match(sql, /create or replace function public\.fail_vision_analysis/i);
  assert.doesNotMatch(sql, /update\s+public\.ai_analysis\s+set\s+status\s*=\s*'completed'/i);
  assert.doesNotMatch(sql, /insert into .*vision_quota_reservations/i);
  assert.match(sql, /version\s*=\s*a\.version\s*\+\s*1/i);
  assert.doesNotMatch(sql, /version\s*=\s*version\s*\+\s*1/i);
});

test("0049 readback covers schema and corrected RPC definitions", () => {
  assert.match(readback, /information_schema\.columns/i);
  assert.match(readback, /pg_get_functiondef/i);
  assert.match(readback, /ambiguous_version/i);
  assert.match(readback, /pg_indexes/i);
});

test("0049 rollback is explicitly non-destructive", () => {
  assert.match(rollback, /forward-only/i);
  assert.doesNotMatch(rollback, /drop function|drop column|drop index|delete from|update /i);
});
