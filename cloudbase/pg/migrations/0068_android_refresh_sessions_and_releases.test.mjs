import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("./0068_android_refresh_sessions_and_releases.sql", import.meta.url), "utf8");

test("0068 creates server-only refresh sessions with atomic rotation", () => {
  assert.match(sql, /create table if not exists public\.auth_refresh_sessions/i);
  assert.match(sql, /token_hash char\(64\) not null unique/i);
  assert.match(sql, /references public\.app_users\s*\(id\) on delete cascade/i);
  assert.match(sql, /create or replace function public\.rotate_auth_refresh_session/i);
  assert.match(sql, /for update/i);
  assert.match(sql, /alter table public\.auth_refresh_sessions enable row level security/i);
  assert.match(sql, /revoke all on public\.auth_refresh_sessions from public, anon, authenticated/i);
});

test("0068 creates validated server-owned Android releases", () => {
  assert.match(sql, /create table if not exists public\.app_releases/i);
  assert.match(sql, /version_code integer not null check \(version_code > 0\)/i);
  assert.match(sql, /apk_sha256 char\(64\)/i);
  assert.match(sql, /app_releases_apk_sha256_check/i);
  assert.match(sql, /alter table public\.app_releases enable row level security/i);
  assert.match(sql, /revoke all on public\.app_releases from public, anon, authenticated/i);
});
