import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("./0050_transport_fixture_rpc.sql", import.meta.url), "utf8");
const readback = await readFile(new URL("./0050_transport_fixture_rpc.readback.sql", import.meta.url), "utf8");
const rollback = await readFile(new URL("./0050_transport_fixture_rpc.rollback.sql", import.meta.url), "utf8");

test("0050 defines only exact transport fixture RPCs", () => {
  assert.match(sql, /create or replace function public\.find_active_transport_fixtures/i);
  assert.match(sql, /create or replace function public\.create_transport_fixture/i);
  assert.match(sql, /create or replace function public\.cleanup_transport_fixture/i);
  assert.match(sql, /p_client_request_id uuid/i);
  assert.match(sql, /p_trace_id text/i);
  assert.match(sql, /p_purpose text/i);
  assert.match(sql, /quota_state = 'none'/i);
  assert.match(sql, /transport-smoke-/i);
  assert.doesNotMatch(sql, /vision_quota_reservations/i);
  assert.doesNotMatch(sql, /delete from public\.ai_analysis\s*;/i);
});

test("0050 readback covers signatures and safety guards", () => {
  assert.match(readback, /pg_get_function_identity_arguments/i);
  assert.match(readback, /transport_marker/i);
  assert.match(readback, /no_quota_guard/i);
});

test("0050 rollback is explicitly forward-only", () => {
  assert.match(rollback, /forward-only/i);
  assert.doesNotMatch(rollback, /drop function|delete from|drop table/i);
});
