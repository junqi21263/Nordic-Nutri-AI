import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = new URL("./0033_coach_daily_message_limit.sql", import.meta.url);

test("coach daily message limit is atomic, server-only, and uses China time", () => {
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(sql, /create or replace function public\.consume_coach_daily_message/i);
  assert.match(sql, /on conflict \(user_id, operation, window_started_at\) do update/i);
  assert.match(sql, /request_count < p_limit/i);
  assert.match(sql, /Asia\/Shanghai/i);
  assert.doesNotMatch(sql, /rate_limit_windows window\b/i);
  assert.match(sql, /revoke all on function public\.consume_coach_daily_message/i);
  assert.match(sql, /grant execute on function public\.consume_coach_daily_message\(uuid, integer\) to service_role/i);
});
