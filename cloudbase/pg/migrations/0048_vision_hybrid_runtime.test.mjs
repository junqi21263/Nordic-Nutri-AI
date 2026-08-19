import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("./0048_vision_hybrid_runtime.sql", import.meta.url), "utf8");
const rollbackSql = await readFile(new URL("./0048_vision_hybrid_runtime.rollback.sql", import.meta.url), "utf8");
const readbackSql = await readFile(new URL("./0048_vision_hybrid_runtime.readback.sql", import.meta.url), "utf8");

test("hybrid runtime migration provides CAS-protected handoff and checkpoint RPCs", () => {
  assert.match(sql, /create or replace function public\.queue_vision_analysis/);
  assert.match(sql, /p_expected_version bigint/);
  assert.match(sql, /execution_owner = 'fast'/);
  assert.match(sql, /dispatch_state = 'queued'/);
  assert.match(sql, /create or replace function public\.checkpoint_vision_analysis/);
  assert.match(sql, /provider_checkpoint/);
  assert.match(sql, /version = a\.version \+ 1/);
  assert.doesNotMatch(sql, /version = version \+ 1/);
  assert.doesNotMatch(sql, /returning true, id, version/);
});

test("hybrid runtime migration provides CAS-protected terminal transitions", () => {
  assert.match(sql, /create or replace function public\.complete_vision_analysis/);
  assert.match(sql, /create or replace function public\.fail_vision_analysis/);
  assert.match(sql, /p_expected_version bigint/);
  assert.match(sql, /status = 'completed'/);
  assert.match(sql, /status = p_status/);
});

test("hybrid runtime rollback and readback are authored without data rewrites", () => {
  assert.match(rollbackSql, /drop function if exists public\.complete_vision_analysis/i);
  assert.match(rollbackSql, /drop function if exists public\.fail_vision_analysis/i);
  assert.doesNotMatch(rollbackSql, /delete from|update public\.ai_analysis/i);
  assert.match(readbackSql, /pg_get_function_identity_arguments/i);
  assert.match(readbackSql, /execution_owner = 'async'/i);
});
