import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("./20260913000000_device_push_tokens.sql", import.meta.url);

test("device push token migration is safe on fresh and existing environments", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /create table if not exists public\.device_push_tokens/i);
  assert.match(sql, /package_name in \('com\.lewislee\.nordicnutri\.dev', 'com\.lewislee\.nordicnutri'\)/i);
  assert.match(sql, /drop constraint if exists device_push_tokens_package_name_check/i);
  assert.match(sql, /alter table public\.device_push_tokens enable row level security/i);
  assert.match(sql, /revoke all on public\.device_push_tokens from public, anon, authenticated/i);
  assert.match(sql, /grant all on public\.device_push_tokens to service_role/i);
});
