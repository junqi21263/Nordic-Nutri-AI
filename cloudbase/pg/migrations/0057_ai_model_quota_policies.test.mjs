import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("model quota migration creates an atomic global provider-model-feature guard", async () => {
  const sql = await readFile(new URL("./0057_ai_model_quota_policies.sql", import.meta.url), "utf8").catch(() => "");
  assert.match(sql, /create table if not exists public\.ai_model_quota_policies/i);
  assert.match(sql, /primary key \(provider_key, model_key, feature_key\)/i);
  assert.match(sql, /create table if not exists private\.ai_model_quota_windows/i);
  assert.match(sql, /create or replace function public\.consume_ai_model_quota/i);
  assert.match(sql, /create or replace function public\.get_ai_model_quota_usage/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /enable row level security/i);
});
