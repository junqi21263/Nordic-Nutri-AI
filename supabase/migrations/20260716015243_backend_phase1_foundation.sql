-- Nordic Nutri AI: backend Phase 1 foundation.
-- This migration evolves the initial local-first schema without changing any
-- mini-program fixture, route, or default data source.

create table public.user_settings (
  id uuid primary key references public.users(id) on delete cascade,
  dietary_pattern text not null default 'none'
    check (dietary_pattern in ('none', 'vegetarian', 'vegan', 'pescatarian', 'low_carb', 'keto', 'mediterranean', 'halal')),
  food_avoidances text[] not null default '{}',
  meals_per_day smallint not null default 3 check (meals_per_day between 2 and 5),
  theme text not null default 'system' check (theme in ('light', 'dark', 'system')),
  locale text not null default 'zh-CN' check (locale in ('zh-CN', 'en')),
  unit_system text not null default 'metric' check (unit_system in ('metric', 'imperial')),
  notification_enabled boolean not null default true,
  developer_mode boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.uploaded_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  bucket_id text not null default 'food-images' check (bucket_id = 'food-images'),
  object_path text not null check (char_length(object_path) between 1 and 512),
  content_type text not null check (content_type in ('image/jpeg', 'image/webp')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 5242880),
  sha256 char(64) not null check (sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'uploaded'
    check (status in ('uploaded', 'attached', 'expired', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, object_path)
);

alter table public.body_profiles
  add column is_current boolean not null default true;

alter table public.nutrition_plans
  add column version integer not null default 1 check (version > 0),
  add column activated_at timestamptz,
  add column archived_at timestamptz,
  add column generation_request_id uuid,
  drop constraint nutrition_plans_status_check,
  add constraint nutrition_plans_status_check
    check (status in ('draft', 'active', 'superseded', 'archived', 'completed')),
  add constraint nutrition_plans_archived_at_check
    check (archived_at is null or archived_at >= created_at);

create table public.health_plan_items (
  id uuid primary key default gen_random_uuid(),
  nutrition_plan_id uuid not null references public.nutrition_plans(id) on delete cascade,
  sequence smallint not null check (sequence between 1 and 10),
  meal_type text check (meal_type is null or meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  target_calories_kcal numeric(6, 0) check (target_calories_kcal is null or target_calories_kcal >= 0),
  target_protein_g numeric(6, 1) check (target_protein_g is null or target_protein_g >= 0),
  target_carbs_g numeric(6, 1) check (target_carbs_g is null or target_carbs_g >= 0),
  target_fat_g numeric(6, 1) check (target_fat_g is null or target_fat_g >= 0),
  guidance text check (guidance is null or char_length(guidance) <= 1000),
  completion_status text not null default 'pending'
    check (completion_status in ('pending', 'completed', 'skipped')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (nutrition_plan_id, sequence)
);

alter table public.ai_analysis
  add column asset_id uuid references public.uploaded_assets(id) on delete set null,
  add column client_request_id uuid,
  add constraint ai_analysis_user_request_id_key unique (user_id, client_request_id);

alter table public.meal_records
  add column client_request_id uuid,
  alter column calories_kcal set default 0,
  alter column protein_g set default 0,
  alter column carbs_g set default 0,
  alter column fat_g set default 0,
  add constraint meal_records_user_request_id_key unique (user_id, client_request_id);

create table public.coach_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  title text check (title is null or char_length(btrim(title)) between 1 and 100),
  status text not null default 'active' check (status in ('active', 'archived')),
  last_message_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.coach_messages
  add column conversation_id uuid references public.coach_conversations(id) on delete cascade,
  add column role text not null default 'assistant'
    check (role in ('user', 'assistant', 'system')),
  add column content text,
  add column status text not null default 'completed'
    check (status in ('pending', 'completed', 'failed')),
  add column client_request_id uuid,
  alter column question_type drop not null,
  alter column context_snapshot set default '{}'::jsonb,
  alter column answer drop not null,
  add constraint coach_messages_user_request_id_key unique (user_id, client_request_id),
  add constraint coach_messages_content_check
    check (content is null or char_length(content) between 1 and 4000);

create unique index body_profiles_one_current_per_user_idx
  on public.body_profiles (user_id)
  where is_current;

create index user_settings_updated_at_idx on public.user_settings (updated_at desc);
create index uploaded_assets_user_created_at_idx on public.uploaded_assets (user_id, created_at desc);
create index uploaded_assets_user_sha256_idx on public.uploaded_assets (user_id, sha256);
create index health_plan_items_plan_sequence_idx on public.health_plan_items (nutrition_plan_id, sequence);
create unique index nutrition_plans_user_generation_request_idx
  on public.nutrition_plans (user_id, generation_request_id)
  where generation_request_id is not null;
create index ai_analysis_asset_id_idx on public.ai_analysis (asset_id);
create index coach_conversations_user_last_message_idx
  on public.coach_conversations (user_id, last_message_at desc)
  where status = 'active';
create index coach_messages_conversation_created_idx
  on public.coach_messages (conversation_id, created_at desc)
  where conversation_id is not null;

create or replace function private.retire_previous_current_goal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_current then
    update public.user_goals
    set is_current = false
    where user_id = new.user_id
      and id <> new.id
      and is_current;
  end if;
  return new;
end;
$$;

create or replace function private.retire_previous_current_body_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.is_current then
    update public.body_profiles
    set is_current = false
    where user_id = new.user_id
      and id <> new.id
      and is_current;
  end if;
  return new;
end;
$$;

create or replace function private.recalculate_meal_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_meal_id uuid;
begin
  target_meal_id := case
    when tg_op = 'DELETE' then old.meal_record_id
    else new.meal_record_id
  end;

  update public.meal_records as meal_record
  set calories_kcal = coalesce(totals.calories_kcal, 0),
      protein_g = coalesce(totals.protein_g, 0),
      carbs_g = coalesce(totals.carbs_g, 0),
      fat_g = coalesce(totals.fat_g, 0)
  from (
    select
      sum(confirmed_quantity_g * calories_per_100g / 100) as calories_kcal,
      sum(confirmed_quantity_g * protein_g_per_100g / 100) as protein_g,
      sum(confirmed_quantity_g * carbs_g_per_100g / 100) as carbs_g,
      sum(confirmed_quantity_g * fat_g_per_100g / 100) as fat_g
    from public.meal_items
    where meal_record_id = target_meal_id
  ) as totals
  where meal_record.id = target_meal_id;

  return coalesce(new, old);
end;
$$;

revoke all on function private.retire_previous_current_goal() from public, anon, authenticated;
revoke all on function private.retire_previous_current_body_profile() from public, anon, authenticated;
revoke all on function private.recalculate_meal_totals() from public, anon, authenticated;

create trigger user_goals_retire_previous_current
before insert on public.user_goals
for each row execute function private.retire_previous_current_goal();

create trigger body_profiles_retire_previous_current
before insert on public.body_profiles
for each row execute function private.retire_previous_current_body_profile();

create trigger meal_items_recalculate_meal_totals
after insert or update or delete on public.meal_items
for each row execute function private.recalculate_meal_totals();

create trigger set_updated_at
before update on public.user_settings
for each row execute function public.set_updated_at();

create trigger set_updated_at
before update on public.uploaded_assets
for each row execute function public.set_updated_at();

create trigger set_updated_at
before update on public.health_plan_items
for each row execute function public.set_updated_at();

create trigger set_updated_at
before update on public.coach_conversations
for each row execute function public.set_updated_at();

-- Extend the auth projection so every identity receives its cross-device
-- dietary and display settings without trusting client metadata.
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id) values (new.id) on conflict (id) do nothing;
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  insert into public.user_settings (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;

alter table public.user_settings enable row level security;
alter table public.uploaded_assets enable row level security;
alter table public.health_plan_items enable row level security;
alter table public.coach_conversations enable row level security;

grant select on public.user_settings, public.uploaded_assets, public.health_plan_items,
  public.coach_conversations to authenticated;
grant update (dietary_pattern, food_avoidances, meals_per_day, theme, locale, unit_system,
  notification_enabled, developer_mode) on public.user_settings to authenticated;
grant insert (user_id, bucket_id, object_path, content_type, byte_size, sha256, status),
  update (status) on public.uploaded_assets to authenticated;
grant insert (user_id, plan_id, meal_type, name, image_path, recorded_at, is_favorite, client_request_id),
  update (plan_id, meal_type, name, image_path, recorded_at, is_favorite, deleted_at)
  on public.meal_records to authenticated;
grant insert (meal_record_id, food_id, name, ai_quantity_g, confirmed_quantity_g,
  calories_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g),
  update (food_id, name, ai_quantity_g, confirmed_quantity_g, calories_per_100g,
    protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g), delete
  on public.meal_items to authenticated;

create policy "user settings: users read own settings"
on public.user_settings for select to authenticated
using ((select auth.uid()) = id);

create policy "user settings: users update own settings"
on public.user_settings for update to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "uploaded assets: users read own assets"
on public.uploaded_assets for select to authenticated
using ((select auth.uid()) = user_id);

create policy "uploaded assets: users insert own assets"
on public.uploaded_assets for insert to authenticated
with check ((select auth.uid()) = user_id);

create policy "uploaded assets: users update own assets"
on public.uploaded_assets for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "health plan items: users read own plan items"
on public.health_plan_items for select to authenticated
using (
  exists (
    select 1 from public.nutrition_plans as nutrition_plan
    where nutrition_plan.id = health_plan_items.nutrition_plan_id
      and nutrition_plan.user_id = (select auth.uid())
  )
);

create policy "meal records: users insert own records"
on public.meal_records for insert to authenticated
with check ((select auth.uid()) = user_id);

-- UPDATE needs a SELECT policy in Postgres RLS. Archived rows remain readable
-- only to their owner so an owner can restore or inspect history; list queries
-- must explicitly filter `deleted_at is null`.
drop policy "meal records: users read own active records" on public.meal_records;
create policy "meal records: users read own records"
on public.meal_records for select to authenticated
using ((select auth.uid()) = user_id);

create policy "meal records: users update own records"
on public.meal_records for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "meal items: users insert own items"
on public.meal_items for insert to authenticated
with check (
  exists (
    select 1 from public.meal_records as meal_record
    where meal_record.id = meal_items.meal_record_id
      and meal_record.user_id = (select auth.uid())
      and meal_record.deleted_at is null
  )
);

create policy "meal items: users update own items"
on public.meal_items for update to authenticated
using (
  exists (
    select 1 from public.meal_records as meal_record
    where meal_record.id = meal_items.meal_record_id
      and meal_record.user_id = (select auth.uid())
      and meal_record.deleted_at is null
  )
)
with check (
  exists (
    select 1 from public.meal_records as meal_record
    where meal_record.id = meal_items.meal_record_id
      and meal_record.user_id = (select auth.uid())
      and meal_record.deleted_at is null
  )
);

create policy "meal items: users delete own items"
on public.meal_items for delete to authenticated
using (
  exists (
    select 1 from public.meal_records as meal_record
    where meal_record.id = meal_items.meal_record_id
      and meal_record.user_id = (select auth.uid())
      and meal_record.deleted_at is null
  )
);

create policy "coach conversations: users read own conversations"
on public.coach_conversations for select to authenticated
using ((select auth.uid()) = user_id);
