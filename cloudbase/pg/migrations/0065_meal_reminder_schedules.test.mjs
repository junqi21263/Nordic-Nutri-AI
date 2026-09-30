import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("meal reminder schedules are indexed and server-owned", async () => {
  const sql = await readFile(new URL("./0065_meal_reminder_schedules.sql", import.meta.url), "utf8");
  assert.match(sql, /unique \(user_id, meal_type\)/i);
  assert.match(sql, /where enabled = true/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /revoke all .* anon, authenticated/i);
  assert.match(sql, /grant all .* service_role/i);
});

test("scheduled reminders persist the locale used for notification copy", async () => {
  const sql = await readFile(new URL("./0068_meal_reminder_locale.sql", import.meta.url), "utf8");
  assert.match(sql, /add column if not exists locale text not null default 'zh-CN'/i);
  assert.match(sql, /locale in \('zh-CN', 'zh-TW', 'en'\)/i);
});
