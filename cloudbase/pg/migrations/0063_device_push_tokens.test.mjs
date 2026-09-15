import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("./0063_device_push_tokens.sql", import.meta.url);

test("device push tokens are server-managed and scoped to the DEV Android client", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /create table public\.device_push_tokens/);
  assert.match(sql, /user_id uuid not null references public\.app_users\(id\) on delete cascade/);
  assert.match(sql, /unique \(token\)/);
  assert.match(sql, /package_name = 'com\.lewislee\.nordicnutri\.dev'/);
  assert.match(sql, /alter table public\.device_push_tokens enable row level security/);
  assert.match(sql, /revoke all on public\.device_push_tokens from anon, authenticated/);
  assert.match(sql, /grant all on public\.device_push_tokens to service_role/);
});
