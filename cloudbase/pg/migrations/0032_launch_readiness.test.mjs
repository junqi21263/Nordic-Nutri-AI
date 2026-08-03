import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = new URL("./0032_launch_readiness.sql", import.meta.url);

test("launch-readiness migration creates server-only operation and deletion records", () => {
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(sql, /create table if not exists private\.operation_requests/i);
  assert.match(sql, /primary key \(user_id, operation, client_request_id\)/i);
  assert.match(sql, /create table if not exists private\.rate_limit_windows/i);
  assert.match(sql, /primary key \(user_id, operation, window_started_at\)/i);
  assert.match(sql, /create table if not exists public\.account_deletion_audit/i);
  assert.match(sql, /unique \(user_id, client_request_id\)/i);
  assert.match(sql, /create or replace function public\.claim_operation_request/i);
  assert.match(sql, /on conflict \(user_id, operation, client_request_id\) do nothing/i);
  assert.match(sql, /create or replace function public\.complete_operation_request/i);
  assert.match(sql, /where user_id = p_user_id[\s\S]*state = 'started'/i);
  assert.match(sql, /revoke all on function public\.claim_operation_request/i);
  assert.match(sql, /alter table public\.account_deletion_audit enable row level security/i);
  assert.match(sql, /for all to public using \(false\) with check \(false\)/i);
  assert.doesNotMatch(sql, /openid|avatar_path|object_path|image_base64/i);
});
