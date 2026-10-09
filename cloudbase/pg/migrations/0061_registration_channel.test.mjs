import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = new URL("./0061_registration_channel.sql", import.meta.url);

test("registration channel distinguishes signup methods and backfills existing users", async () => {
  const sql = await readFile(migrationPath, "utf8");
  assert.match(sql, /add column if not exists registration_channel text/);
  assert.match(sql, /google_sub is not null then 'google'/);
  assert.match(sql, /phone_e164 is not null then 'phone'/);
  assert.match(sql, /email_normalized is not null then 'email'/);
  assert.match(sql, /registration_channel in \('wechat', 'email', 'phone', 'google'\)/);
});
