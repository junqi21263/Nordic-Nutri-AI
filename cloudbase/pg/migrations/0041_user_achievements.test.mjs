import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("persists permanent server-owned user achievement completions", async () => {
  const sql = await readFile(new URL("./0041_user_achievements.sql", import.meta.url), "utf8");
  assert.match(sql, /create table if not exists public\.user_achievements/i);
  assert.match(sql, /user_id uuid not null references public\.app_users\(id\) on delete cascade/i);
  assert.match(sql, /achievement_id text not null/i);
  assert.match(sql, /completed_at timestamptz not null/i);
  assert.match(sql, /primary key \(user_id, achievement_id\)/i);
  assert.match(sql, /revoke all on public\.user_achievements from public, anon, authenticated/i);
  assert.match(sql, /user achievements: server only/i);
});
