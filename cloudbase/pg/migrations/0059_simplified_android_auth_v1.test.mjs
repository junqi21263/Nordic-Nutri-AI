import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("./0059_simplified_android_auth_v1.sql", import.meta.url);

test("simplified Android auth migration keeps one user table and one verification table", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /alter table public\.app_users/);
  assert.match(sql, /add column if not exists created_platform/);
  assert.match(sql, /add column if not exists token_version/);
  assert.match(sql, /create table if not exists public\.auth_verification_codes/);
  assert.match(sql, /target_type in \('email', 'captcha'\)/);
  assert.match(sql, /purpose in \('register', 'reset_password', 'captcha'\)/);
  assert.match(sql, /add column if not exists password_changed_at/);
  assert.match(sql, /create or replace function public\.consume_auth_verification_code/);
  assert.doesNotMatch(sql, /user_identities|auth_sessions|session_family/i);
  assert.doesNotMatch(sql, /phone_e164|google_sub/i);
});
