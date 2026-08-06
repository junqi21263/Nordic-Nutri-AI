import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migrationPath = new URL("./0034_admin_ops_full.sql", import.meta.url);

test("admin ops migration creates metric, deletion, and moderation tables", () => {
  const sql = readFileSync(migrationPath, "utf8");

  assert.match(sql, /create table if not exists public\.ops_metric_events/i);
  assert.match(sql, /metric text not null/i);
  assert.match(sql, /value double precision not null default 1/i);
  assert.match(sql, /meta jsonb/i);
  assert.match(sql, /ops_metric_events_metric_created_at_idx/i);
  assert.match(sql, /\(metric, created_at desc\)/i);

  assert.match(sql, /create table if not exists public\.ops_account_deletion_log/i);
  assert.match(sql, /user_id uuid not null/i);
  assert.match(sql, /client_request_id uuid not null/i);
  assert.match(sql, /outcome text not null check \(outcome in \('started', 'succeeded', 'failed'\)\)/i);
  assert.match(sql, /ops_account_deletion_log_created_at_idx/i);
  assert.doesNotMatch(sql, /references public\.app_users/i);

  assert.match(sql, /create table if not exists public\.content_moderation_flags/i);
  assert.match(sql, /source text not null check \(source in \('feedback', 'coach', 'nickname', 'export'\)\)/i);
  assert.match(sql, /status text not null default 'open' check \(status in \('open', 'reviewed', 'dismissed'\)\)/i);
  assert.match(sql, /content_moderation_flags_status_created_at_idx/i);

  assert.match(sql, /create or replace function public\.consume_rate_limit_window/i);
  assert.match(sql, /create or replace function public\.get_rate_limit_window_usage/i);
  assert.match(sql, /private\.rate_limit_windows/i);
  assert.doesNotMatch(sql, /drop table/i);
});
