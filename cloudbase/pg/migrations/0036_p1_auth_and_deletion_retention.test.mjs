import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("P1 migration persists admin login attempts and bounds deletion audit retention", async () => {
  const sql = await readFile(new URL("./0036_p1_auth_and_deletion_retention.sql", import.meta.url), "utf8");
  assert.match(sql, /create table if not exists private\.admin_login_attempts/i);
  assert.match(sql, /attempt_key text primary key/i);
  assert.match(sql, /create or replace function public\.consume_admin_login_attempt/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /grant execute on function public\.consume_admin_login_attempt\(text, integer, integer\) to service_role/i);
  assert.match(sql, /add column if not exists expires_at timestamptz/i);
  assert.match(sql, /now\(\) \+ interval '30 days'/i);
});
