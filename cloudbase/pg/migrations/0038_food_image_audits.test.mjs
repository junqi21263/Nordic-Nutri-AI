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
  assert.match(migration, /check \(reviewed_count <= candidate_count\)/i);
  assert.match(migration, /cached service-maintained audit candidate summary/i);
  assert.match(migration, /intentionally not maintained by a row-count trigger/i);
  assert.match(migration, /check \(status in \('pending_review','ai_pass','needs_review','failed','kept','regeneration_requested'\)\)/i);
});

test("0038 snapshots audit inputs with foreign keys and query indexes", () => {
  assert.match(migration, /run_id uuid not null references public\.food_image_audit_runs\(id\) on delete cascade/i);
  assert.match(migration, /food_id uuid references public\.foods\(id\) on delete restrict/i);
  assert.doesNotMatch(migration, /food_id uuid references public\.foods\(id\) on delete set null/i);
  assert.doesNotMatch(migration, /food_id uuid not null references public\.foods\(id\) on delete cascade/i);
  assert.match(migration, /old_image_id uuid not null references public\.food_images\(id\) on delete restrict/i);
  assert.match(migration, /regeneration_job_id uuid references public\.food_image_jobs\(id\) on delete set null/i);
  assert.match(migration, /image_url text not null/i);
  assert.match(migration, /prompt_plan_json jsonb not null/i);
  assert.match(migration, /create index if not exists food_image_audit_items_run_status_idx/i);
  assert.match(migration, /create index if not exists food_image_audit_items_food_created_idx/i);
  assert.match(migration, /create index if not exists food_image_audit_items_old_image_idx/i);
});

test("0038 validates that an audited old image matches repository-ready primary semantics", () => {
  assert.match(migration, /create or replace function public\.validate_food_image_audit_item_old_image\(\)/i);
  assert.match(migration, /from public\.food_images image/i);
  assert.match(migration, /image\.id = new\.old_image_id/i);
  assert.match(migration, /image\.food_id = new\.food_id/i);
  assert.match(migration, /image\.is_primary/i);
  assert.match(migration, /image\.status = 'ready'/i);
  assert.match(migration, /\(image\.review_status is null or image\.review_status = 'approved'\)/i);
  assert.match(migration, /raise exception 'food_image_audit_items\.old_image_id must reference a ready approved primary image for the same food'/i);
  assert.match(migration, /before insert or update of food_id, old_image_id on public\.food_image_audit_items/i);
});

test("0038 rejects manual null food_id and permits only the controlled food-delete path", () => {
  assert.match(migration, /if tg_op = 'INSERT' then/i);
  assert.match(migration, /food_image_audit_items\.food_id is required when creating an audit item/i);
  assert.match(migration, /current_setting\('app\.food_image_audit_preserve_history', true\) is distinct from 'on'/i);
  assert.match(migration, /food_image_audit_items\.food_id may only be nulled by the controlled food deletion path/i);
  assert.match(migration, /old\.food_id is null/i);
  assert.match(migration, /new\.old_image_id is distinct from old\.old_image_id/i);
  assert.match(migration, /new\.image_url is distinct from old\.image_url/i);
  assert.match(migration, /new\.prompt_plan_json is distinct from old\.prompt_plan_json/i);
});

test("0038 preserves food-delete history only through a transaction-local GUC", () => {
  assert.match(migration, /create or replace function public\.preserve_food_image_audit_history_before_food_delete\(\)/i);
  assert.match(migration, /set_config\('app\.food_image_audit_preserve_history', 'on', true\)/i);
  assert.match(migration, /update public\.food_image_audit_items\s+set food_id = null\s+where food_id = old\.id/i);
  assert.match(migration, /set_config\('app\.food_image_audit_preserve_history', 'off', true\)/i);
  assert.match(migration, /before delete on public\.foods/i);
});

test("0038 enforces audit state, decision, and regeneration job consistency", () => {
  assert.match(
    migration,
    /status = 'regeneration_requested'\s+and operator_decision is not distinct from 'regenerate'\s+and regeneration_job_id is not null/i,
  );
  assert.match(
    migration,
    /status = 'kept'\s+and operator_decision is not distinct from 'keep'\s+and regeneration_job_id is null/i,
  );
  assert.match(
    migration,
    /status not in \('regeneration_requested','kept'\)\s+and operator_decision is null\s+and regeneration_job_id is null/i,
  );
});

test("0038 validates regeneration jobs and preserves history before a job delete", () => {
  assert.match(migration, /create or replace function public\.validate_food_image_audit_item_regeneration_job\(\)/i);
  assert.match(migration, /if new\.regeneration_job_id is null or new\.food_id is null then/i);
  assert.match(migration, /from public\.food_image_jobs job/i);
  assert.match(migration, /job\.id = new\.regeneration_job_id/i);
  assert.match(migration, /job\.food_id = new\.food_id/i);
  assert.match(migration, /job\.job_type = 'regenerate'/i);
  assert.match(migration, /food_image_audit_items\.regeneration_job_id must reference the same food's regenerate job/i);
  assert.match(migration, /before insert or update of food_id, regeneration_job_id on public\.food_image_audit_items/i);
  assert.match(migration, /create or replace function public\.preserve_food_image_audit_job_history_before_delete\(\)/i);
  assert.match(migration, /set status = 'needs_review',\s+regeneration_job_id = null,\s+operator_decision = null/i);
  assert.match(migration, /where regeneration_job_id = old\.id\s+and status = 'regeneration_requested'/i);
  assert.match(migration, /before delete on public\.food_image_jobs/i);
});

test("0038 makes audit snapshots immutable after creation", () => {
  assert.match(migration, /create or replace function public\.prevent_food_image_audit_item_snapshot_mutation\(\)/i);
  assert.match(migration, /new\.old_image_id is distinct from old\.old_image_id/i);
  assert.match(migration, /new\.image_url is distinct from old\.image_url/i);
  assert.match(migration, /new\.visual_type is distinct from old\.visual_type/i);
  assert.match(migration, /new\.decision_source is distinct from old\.decision_source/i);
  assert.match(migration, /new\.matched_keywords is distinct from old\.matched_keywords/i);
  assert.match(migration, /new\.risk_reasons is distinct from old\.risk_reasons/i);
  assert.match(migration, /new\.prompt_plan_json is distinct from old\.prompt_plan_json/i);
  assert.match(migration, /food_image_audit_items snapshots are immutable after creation/i);
  assert.match(migration, /before update of old_image_id, image_url, visual_type, decision_source, matched_keywords, risk_reasons, prompt_plan_json/i);
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
