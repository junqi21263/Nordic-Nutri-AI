import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const sql = fs.readFileSync(new URL("./0052_ai_model_configs.sql", import.meta.url), "utf8");

test("ai model config migration is generic and server-only", () => {
  assert.match(sql, /create table if not exists public\.ai_model_configs/i);
  assert.match(sql, /provider_key text not null/i);
  assert.match(sql, /model_key text not null/i);
  assert.match(sql, /api_key_env text not null/i);
  assert.match(sql, /feature_keys text\[\] not null/i);
  assert.match(sql, /alter table public\.ai_model_configs enable row level security/i);
  assert.match(sql, /using \(false\) with check \(false\)/i);
  assert.doesNotMatch(sql, /api_key\s+text/i);
  assert.doesNotMatch(sql, /drop table/i);
});
