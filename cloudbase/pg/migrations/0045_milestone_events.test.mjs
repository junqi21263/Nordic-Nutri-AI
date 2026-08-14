import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("creates reversible server-owned streak cycles and milestone events", async () => {
  const sql = await readFile(new URL("./0045_milestone_events.sql", import.meta.url), "utf8");
  const rollback = await readFile(new URL("./0045_milestone_events.rollback.sql", import.meta.url), "utf8");

  assert.match(sql, /alter table public\.meal_records\s+add column if not exists plan_id uuid references public\.nutrition_plans\(id\) on delete set null/i);
  assert.match(sql, /create table if not exists public\.streak_cycles/i);
  assert.match(sql, /status text not null check \(status in \('active', 'ended', 'merged'\)\)/i);
  assert.match(sql, /canonical_cycle_id uuid references public\.streak_cycles\(id\) on delete set null/i);
  assert.match(sql, /create table if not exists public\.milestone_events/i);
  assert.match(sql, /milestone smallint not null check \(milestone in \(3, 7, 14, 30\)\)/i);
  assert.match(sql, /source text not null check \(source in \('normal_record', 'backfill'\)\)/i);
  assert.match(sql, /status text not null check \(status in \('pending', 'presented', 'invalidated'\)\)/i);
  assert.match(sql, /presentation_snapshot jsonb/i);
  assert.match(sql, /presentation_claimed_at timestamptz/i);
  assert.match(sql, /presentation_claim_token uuid/i);
  assert.match(sql, /unique \(user_id, cycle_id, milestone\)/i);
  assert.match(sql, /milestone_events_pending_claim_idx/i);
  assert.match(sql, /revoke all on public\.streak_cycles from public, anon, authenticated/i);
  assert.match(sql, /revoke all on public\.milestone_events from public, anon, authenticated/i);
  assert.match(sql, /streak cycles: server only/i);
  assert.match(sql, /milestone events: server only/i);

  assert.match(rollback, /drop table if exists public\.milestone_events/i);
  assert.match(rollback, /drop table if exists public\.streak_cycles/i);
  assert.match(rollback, /alter table public\.meal_records drop column if exists plan_id/i);
});
