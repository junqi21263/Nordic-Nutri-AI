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

  assert.match(sql, /add column openid_hash char\(64\) unique/i);
  assert.match(sql, /raw OpenID must never be persisted/i);
  assert.doesNotMatch(sql, /openid text|openid varchar/i);
});
