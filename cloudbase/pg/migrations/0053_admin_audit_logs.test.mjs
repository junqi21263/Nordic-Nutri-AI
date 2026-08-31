import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile(new URL("./0053_admin_audit_logs.sql", import.meta.url), "utf8");

test("0053 creates the server-only admin audit log used by admin mutations", () => {
  assert.match(migration, /create table if not exists public\.admin_audit_logs/i);
  for (const column of ["actor_user_id", "action", "resource_type", "resource_id", "before_snapshot", "after_snapshot", "result", "error_code", "trace_id", "created_at"]) {
    assert.match(migration, new RegExp(`\\b${column}\\b`, "i"));
  }
  assert.match(migration, /alter table public\.admin_audit_logs enable row level security/i);
  assert.match(migration, /revoke all on public\.admin_audit_logs from public, anon, authenticated/i);
  assert.match(migration, /admin audit logs: server only/i);
});
