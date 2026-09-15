import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("./0060_verification_center.sql", import.meta.url);

test("verification center stores lifecycle metadata without OTP plaintext", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /add column if not exists status/);
  assert.match(sql, /add column if not exists provider_message_id/);
  assert.match(sql, /add column if not exists trace_id/);
  assert.match(sql, /target_type in \('email', 'phone', 'captcha'\)/);
  assert.match(sql, /status in \('created', 'sent', 'failed', 'used', 'expired', 'invalidated'\)/);
  assert.doesNotMatch(sql, /(?:otp|verification_code)\s+text/i);
  assert.match(sql, /revoke all on public\.auth_verification_codes/);
});
