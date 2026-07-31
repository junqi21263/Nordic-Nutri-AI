import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("./0025_coach_daily_tips.sql", import.meta.url), "utf8");

test("coach daily tips cache is user/date unique and server-owned", () => {
  assert.match(migration, /create table if not exists public\.coach_daily_tips/i);
  assert.match(migration, /unique \(user_id, tip_date\)/i);
  assert.match(migration, /context_hash char\(64\)/i);
  assert.match(migration, /provider in \('deepseek', 'hunyuan-exp', 'rule_v2'\)/i);
  assert.match(migration, /coach daily tips: server only/i);
});
