import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const sql = await readFile(new URL("./0055_vision_quota_rpc.sql", import.meta.url), "utf8");

test("0055 restores the exact fast-path vision quota RPC contract", () => {
  assert.match(sql, /create table if not exists private\.vision_quota_reservations/i);
  assert.match(sql, /create or replace function public\.reserve_vision_quota/i);
  assert.match(sql, /create or replace function public\.commit_vision_quota/i);
  assert.match(sql, /create or replace function public\.release_vision_quota/i);
  assert.match(sql, /vision_analysis_daily/i);
  assert.match(sql, /vision_analysis_burst/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /force row level security/i);
});

test("0055 is forward-only and does not delete or rewrite product rows", () => {
  assert.doesNotMatch(sql, /drop\s+(table|function|index|column)/i);
  assert.doesNotMatch(sql, /delete\s+from/i);
  assert.doesNotMatch(sql, /update\s+public\.ai_analysis/i);
});
