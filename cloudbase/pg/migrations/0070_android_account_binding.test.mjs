import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const sql = readFileSync(new URL("./0070_android_account_binding.sql", import.meta.url), "utf8");

test("binding migration keeps contact proof and attachment in one server-only transaction", () => {
  assert.match(sql, /purpose in \('register', 'reset_password', 'captcha', 'bind'\)/);
  assert.match(sql, /user_id = p_user_id and used_at is null/);
  assert.match(sql, /for update/);
  assert.match(sql, /attempt_count = attempt_count \+ 1/);
  assert.match(sql, /exception when unique_violation/);
  assert.match(sql, /set used_at = p_now, status = 'used'/);
  assert.match(sql, /revoke all on function public\.bind_android_contact/);
  assert.match(sql, /grant execute on function public\.bind_android_contact[\s\S]*to service_role/);
});

test("Google email is not activated by binding a phone and setting a password", () => {
  assert.match(sql, /add column if not exists email_login_enabled boolean not null default false/);
  assert.match(sql, /email_login_enabled = true/);
  assert.match(sql, /email_login_enabled = case when p_target_type = 'email' then true else email_login_enabled end/);
});
