import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const migration = readFileSync(new URL("./0038_food_image_audits.sql", import.meta.url), "utf8");

test("0038 creates isolated food image audit runs and items", () => {
  assert.match(migration, /create table if not exists public\.food_image_audit_runs/i);
  assert.match(migration, /create table if not exists public\.food_image_audit_items/i);
  assert.match(migration, /scope text not null default 'high_risk_processed'/i);
  assert.match(migration, /check \(scope = 'high_risk_processed'\)/i);
  assert.match(migration, /check \(status in \('previewed','reviewing','completed','completed_with_errors'\)\)/i);
  assert.match(migration, /check \(status in \('pending_review','ai_pass','needs_review','failed','kept','regeneration_requested'\)\)/i);
});

test("0038 snapshots audit inputs with foreign keys and query indexes", () => {
  assert.match(migration, /run_id uuid not null references public\.food_image_audit_runs\(id\) on delete cascade/i);
  assert.match(migration, /food_id uuid not null references public\.foods\(id\) on delete cascade/i);
  assert.match(migration, /old_image_id uuid not null references public\.food_images\(id\) on delete restrict/i);
  assert.match(migration, /regeneration_job_id uuid references public\.food_image_jobs\(id\) on delete set null/i);
  assert.match(migration, /image_url text not null/i);
  assert.match(migration, /prompt_plan_json jsonb not null/i);
  assert.match(migration, /create index if not exists food_image_audit_items_run_status_idx/i);
  assert.match(migration, /create index if not exists food_image_audit_items_food_created_idx/i);
  assert.match(migration, /create index if not exists food_image_audit_items_old_image_idx/i);
});

test("0038 keeps audit tables server-only with updated timestamps", () => {
  assert.match(migration, /food_image_audit_runs_set_updated_at/i);
  assert.match(migration, /food_image_audit_items_set_updated_at/i);
  assert.match(migration, /execute function public\.set_updated_at\(\)/i);
  assert.match(migration, /revoke all on public\.food_image_audit_runs from public, anon, authenticated/i);
  assert.match(migration, /revoke all on public\.food_image_audit_items from public, anon, authenticated/i);
  assert.match(migration, /alter table public\.food_image_audit_runs enable row level security/i);
  assert.match(migration, /alter table public\.food_image_audit_items enable row level security/i);
  assert.match(migration, /food_image_audit_runs: server only/i);
  assert.match(migration, /food_image_audit_items: server only/i);
});

test("0038 never changes food image primary state", () => {
  assert.doesNotMatch(migration, /update\s+public\.food_images\b/i);
  assert.doesNotMatch(migration, /set\s+is_primary\s*=/i);
});
