import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("./0040_nova_daily_briefs.sql", import.meta.url), "utf8");

test("creates a server-only cache for one NOVA reminder per user and day", () => {
  assert.match(migration, /create table if not exists public\.nova_daily_briefs/i);
  assert.match(migration, /unique \(user_id, brief_date\)/i);
  assert.match(migration, /alter table public\.nova_daily_briefs enable row level security/i);
  assert.match(migration, /for all to public using \(false\) with check \(false\)/i);
});
