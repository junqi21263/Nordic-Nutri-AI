import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const requiredObjects = [
  "public.app_users",
  "public.profiles",
  "public.user_settings",
  "public.body_profiles",
  "public.user_goals",
  "public.nutrition_plans",
  "public.health_plan_items",
  "public.food_catalog",
  "public.uploaded_assets",
  "public.ai_analysis",
  "public.meal_records",
  "public.meal_items",
  "public.coach_conversations",
  "public.coach_messages",
  "private.identity_migrations",
];

test("CloudBase PG core migration defines every required business table without Supabase auth", async () => {
  const sql = await readFile(new URL("../../cloudbase/pg/migrations/0001_core_schema.sql", import.meta.url), "utf8");

  for (const objectName of requiredObjects) {
    const [, schema, table] = objectName.match(/^(\w+)\.(\w+)$/) ?? [];
    assert.match(sql, new RegExp(`create table ${schema}\\.${table}\\b`, "i"), objectName);
  }

  assert.match(sql, /cloudbase_uid varchar\(128\) unique/i);
  assert.doesNotMatch(sql, /auth\.users/i);
});

test("CloudBase bootstrap creates the product session from auth.uid instead of a client user id", async () => {
  const sql = await readFile(new URL("../../cloudbase/pg/migrations/0002_user_bootstrap.sql", import.meta.url), "utf8");

  assert.match(sql, /create or replace function public\.bootstrap_current_user\(\)/i);
  assert.match(sql, /auth\.uid\(\)/i);
  assert.match(sql, /insert into public\.app_users/i);
  assert.match(sql, /insert into public\.profiles/i);
  assert.match(sql, /insert into public\.user_settings/i);
  assert.doesNotMatch(sql, /p_user_id|client_user_id/i);
});

test("onboarding tables are protected by CloudBase authenticated RLS policies", async () => {
  const sql = await readFile(new URL("../../cloudbase/pg/migrations/0003_onboarding_permissions.sql", import.meta.url), "utf8");

  for (const table of ["app_users", "profiles", "user_settings", "user_goals", "body_profiles"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"), table);
  }
  assert.match(sql, /private\.current_app_user_id\(\)/i);
  assert.match(sql, /grant execute on function public\.bootstrap_current_user\(\) to authenticated/i);
});

test("client bootstrap receives its CloudBase identity from the database default", async () => {
  const sql = await readFile(new URL("../../cloudbase/pg/migrations/0004_client_bootstrap.sql", import.meta.url), "utf8");

  assert.match(sql, /alter column cloudbase_uid set default auth\.uid\(\)::text/i);
  assert.match(sql, /create trigger app_users_create_default_product_rows/i);
  assert.match(sql, /insert into public\.profiles/i);
  assert.match(sql, /insert into public\.user_settings/i);
  assert.match(sql, /with check \(cloudbase_uid = auth\.uid\(\)::text\)/i);
});

test("nutrition plans receive owner identity from the authenticated CloudBase session", async () => {
  const sql = await readFile(new URL("../../cloudbase/pg/migrations/0005_onboarding_plan_permissions.sql", import.meta.url), "utf8");

  assert.match(sql, /alter column user_id set default private\.current_app_user_id\(\)/i);
  assert.match(sql, /alter table public\.nutrition_plans enable row level security/i);
  assert.match(sql, /plans: insert own rows/i);
  assert.match(sql, /user_id = private\.current_app_user_id\(\)/i);
});

test("native Mini Program identity is stored only as a server-derived OpenID hash", async () => {
  const sql = await readFile(new URL("../../cloudbase/pg/migrations/0006_openid_server_identity.sql", import.meta.url), "utf8");

  assert.match(sql, /add column(?: if not exists)? openid_hash char\(64\) unique/i);
  assert.match(sql, /raw OpenID must never be persisted/i);
  assert.doesNotMatch(sql, /openid text|openid varchar/i);
});

test("meal storage migration supports text-based AI analysis and server-only meal writes", async () => {
  const sql = await readFile(new URL("../../cloudbase/pg/migrations/0008_meal_data.sql", import.meta.url), "utf8");

  for (const table of ["ai_analysis", "meal_records", "meal_items"]) {
    assert.match(sql, new RegExp(`create table(?: if not exists)? public\\.${table}\\b`, "i"), table);
  }
  assert.match(sql, /image_path text check/i);
  assert.match(sql, /image_sha256 char\(64\) check/i);
  assert.match(sql, /create trigger meal_items_recalculate_meal_totals/i);
  assert.match(sql, /revoke all on public\.ai_analysis from public, anon, authenticated/i);
  assert.match(sql, /alter column image_path drop not null/i);
  assert.match(sql, /ai analysis: server only/i);
});

test("incremental CloudBase migrations tolerate objects already created by the core schema", async () => {
  const planSql = await readFile(new URL("../../cloudbase/pg/migrations/0005_onboarding_plan_permissions.sql", import.meta.url), "utf8");
  const identitySql = await readFile(new URL("../../cloudbase/pg/migrations/0006_openid_server_identity.sql", import.meta.url), "utf8");
  const mealSql = await readFile(new URL("../../cloudbase/pg/migrations/0008_meal_data.sql", import.meta.url), "utf8");

  assert.match(planSql, /create table if not exists public\.nutrition_plans/i);
  assert.match(planSql, /create unique index if not exists nutrition_plans_one_active_per_user_idx/i);
  assert.match(identitySql, /add column if not exists openid_hash/i);
  for (const table of ["ai_analysis", "meal_records", "meal_items"]) {
    assert.match(mealSql, new RegExp(`create table if not exists public\\.${table}`, "i"));
  }
  assert.match(mealSql, /drop trigger if exists meal_items_recalculate_meal_totals/i);
});

test("food catalog v2 migration defines the unified food data model with server-only RLS", async () => {
  const sql = await readFile(new URL("../../cloudbase/pg/migrations/0012_food_catalog_v2.sql", import.meta.url), "utf8");

  for (const table of [
    "food_categories", "food_tags", "foods", "food_tag_relations",
    "food_images", "food_source_payloads", "food_sync_jobs", "food_image_tasks",
  ]) {
    assert.match(sql, new RegExp(`create table if not exists public\\.${table}\\b`, "i"), table);
  }
  assert.match(sql, /add column if not exists is_admin boolean not null default false/i);
  assert.match(sql, /create extension if not exists pg_trgm/i);
  assert.match(sql, /foods_name_zh_trigram_idx/i);
  assert.match(sql, /foods_search_keywords_idx/i);
  assert.match(sql, /food_images_one_primary_per_food_idx/i);
  assert.match(sql, /unique \(source, source_id\)/i);
  assert.match(sql, /calories >= 0/i);
  assert.match(sql, /protein_g >= 0/i);
  assert.match(sql, /fat_g >= 0/i);
  assert.match(sql, /carbs_g >= 0/i);
  assert.match(sql, /revoke all on public\.%I from public, anon, authenticated/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /: server only/i);
  assert.match(sql, /insert into public\.food_categories/i);
  assert.match(sql, /insert into public\.food_tags/i);
  assert.match(sql, /'high_protein','高蛋白'/i);
  assert.match(sql, /insert into public\.foods[\s\S]*from public\.food_catalog/i);
});

test("food image generation migration adds jobs queue and review metadata", async () => {
  const sql = await readFile(new URL("../../cloudbase/pg/migrations/0013_food_image_generation.sql", import.meta.url), "utf8");
  assert.match(sql, /create table if not exists public\.food_image_jobs/i);
  assert.match(sql, /food_image_jobs_one_active_per_food_idx/i);
  assert.match(sql, /add column if not exists image_status/i);
  assert.match(sql, /add column if not exists review_status/i);
  assert.match(sql, /create table if not exists public\.food_image_usage_daily/i);
  assert.match(sql, /'hunyuan'/i);
  assert.match(sql, /'candidate'/i);
});

test("food seed inserts 50 high-frequency fixture foods idempotently", async () => {
  const sql = await readFile(new URL("../../cloudbase/pg/seeds/0012_food_seed.sql", import.meta.url), "utf8");
  assert.match(sql, /insert into public\.foods[\s\S]*on conflict \(source, source_id\) do nothing/i);
  assert.match(sql, /'chicken-breast','鸡胸肉'/i);
  assert.match(sql, /'quinoa','藜麦'/i);
  const slugs = sql.match(/\('([a-z-]+)','[^']+','[^']+',/g) ?? [];
  assert.ok(slugs.length >= 50, `expected >=50 seed foods, got ${slugs.length}`);
});

