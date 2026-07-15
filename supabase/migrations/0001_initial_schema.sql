-- Nordic Nutri AI: initial Supabase PostgreSQL schema
-- Amend this initial migration only before its first remote deployment.
-- After deployment, create a new migration for every schema change.

create schema if not exists private;

revoke all on schema private from public;
revoke all on all tables in schema private from public;
revoke all on all functions in schema private from public;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'active'
    check (status in ('active', 'deleted', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references public.users(id) on delete cascade,
  nickname text check (nickname is null or char_length(nickname) between 1 and 40),
  avatar_path text,
  timezone text not null default 'Asia/Shanghai'
    check (char_length(timezone) between 1 and 64),
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Keep the API-facing application user records in lockstep with Supabase Auth.
-- This function is intentionally private and only runs from the auth.users
-- trigger; client roles cannot invoke it directly.
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id)
  values (new.id)
  on conflict (id) do nothing;

  insert into public.profiles (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

create table public.user_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  goal_type text not null
    check (goal_type in ('muscle_gain', 'fat_loss', 'maintain', 'performance')),
  target_weight_kg numeric(5, 1)
    check (target_weight_kg is null or target_weight_kg between 30 and 300),
  target_date date,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.body_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  age smallint not null check (age between 14 and 80),
  sex text not null check (sex in ('female', 'male', 'undisclosed')),
  height_cm numeric(5, 1) not null check (height_cm between 120 and 230),
  weight_kg numeric(5, 1) not null check (weight_kg between 30 and 300),
  activity_level text not null default 'moderate'
    check (activity_level in ('sedentary', 'light', 'moderate', 'high', 'very_high')),
  training_days_per_week smallint not null default 3
    check (training_days_per_week between 0 and 7),
  effective_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.nutrition_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  goal_id uuid not null references public.user_goals(id) on delete cascade,
  body_profile_id uuid not null references public.body_profiles(id) on delete cascade,
  daily_calories_kcal numeric(6, 0) not null check (daily_calories_kcal between 800 and 10000),
  protein_g numeric(6, 1) not null check (protein_g > 0),
  carbs_g numeric(6, 1) not null check (carbs_g >= 0),
  fat_g numeric(6, 1) not null check (fat_g > 0),
  calculation_source text not null default 'formula_v1'
    check (calculation_source in ('formula_v1', 'manual')),
  status text not null default 'active'
    check (status in ('active', 'superseded')),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from)
);

create table public.food_catalog (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null check (char_length(btrim(canonical_name)) between 1 and 100),
  aliases text[] not null default '{}',
  serving_unit text not null default 'g'
    check (serving_unit in ('g', 'ml', 'piece', 'serving')),
  calories_per_100g numeric(7, 2) not null check (calories_per_100g >= 0),
  protein_g_per_100g numeric(7, 2) not null check (protein_g_per_100g >= 0),
  carbs_g_per_100g numeric(7, 2) not null check (carbs_g_per_100g >= 0),
  fat_g_per_100g numeric(7, 2) not null check (fat_g_per_100g >= 0),
  source text not null check (char_length(btrim(source)) between 1 and 200),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_analysis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  image_path text not null check (char_length(image_path) between 1 and 512),
  image_sha256 char(64) not null check (image_sha256 ~ '^[0-9a-f]{64}$'),
  provider text not null check (char_length(btrim(provider)) between 1 and 80),
  model text not null check (char_length(btrim(model)) between 1 and 120),
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'succeeded', 'failed', 'saved', 'expired')),
  confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  raw_recognition jsonb,
  normalized_items jsonb,
  advice text check (advice is null or char_length(advice) <= 1000),
  error_code text check (error_code is null or char_length(error_code) <= 80),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create table public.meal_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  analysis_id uuid references public.ai_analysis(id) on delete set null,
  plan_id uuid references public.nutrition_plans(id) on delete set null,
  meal_type text not null default 'snack'
    check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  image_path text check (image_path is null or char_length(image_path) between 1 and 512),
  recorded_at timestamptz not null default now(),
  calories_kcal numeric(8, 2) not null check (calories_kcal >= 0),
  protein_g numeric(8, 2) not null check (protein_g >= 0),
  carbs_g numeric(8, 2) not null check (carbs_g >= 0),
  fat_g numeric(8, 2) not null check (fat_g >= 0),
  is_favorite boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_record_id uuid not null references public.meal_records(id) on delete cascade,
  food_id uuid references public.food_catalog(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  ai_quantity_g numeric(8, 1) check (ai_quantity_g is null or ai_quantity_g between 0 and 2000),
  confirmed_quantity_g numeric(8, 1) not null check (confirmed_quantity_g between 0 and 2000),
  calories_per_100g numeric(8, 2) not null check (calories_per_100g >= 0),
  protein_g_per_100g numeric(8, 2) not null check (protein_g_per_100g >= 0),
  carbs_g_per_100g numeric(8, 2) not null check (carbs_g_per_100g >= 0),
  fat_g_per_100g numeric(8, 2) not null check (fat_g_per_100g >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  question_type text not null
    check (question_type in ('protein_today', 'dinner_plan', 'muscle_gain', 'fat_loss')),
  context_date date not null default current_date,
  context_snapshot jsonb not null,
  answer jsonb not null,
  provider text check (provider is null or char_length(btrim(provider)) between 1 and 80),
  model text check (model is null or char_length(btrim(model)) between 1 and 120),
  created_at timestamptz not null default now()
);

create table private.wechat_identities (
  user_id uuid primary key references auth.users(id) on delete cascade,
  openid_ciphertext bytea not null,
  openid_hash char(64) not null unique check (openid_hash ~ '^[0-9a-f]{64}$'),
  unionid_ciphertext bytea,
  created_at timestamptz not null default now()
);

create unique index user_goals_one_current_per_user_idx
  on public.user_goals (user_id)
  where is_current;

create index user_goals_user_created_at_idx
  on public.user_goals (user_id, created_at desc);

create index body_profiles_user_effective_at_idx
  on public.body_profiles (user_id, effective_at desc);

create unique index nutrition_plans_one_active_per_user_idx
  on public.nutrition_plans (user_id)
  where status = 'active';

create index nutrition_plans_user_status_effective_from_idx
  on public.nutrition_plans (user_id, status, effective_from desc);

create index nutrition_plans_goal_id_idx
  on public.nutrition_plans (goal_id);

create index nutrition_plans_body_profile_id_idx
  on public.nutrition_plans (body_profile_id);

create unique index food_catalog_canonical_name_lower_idx
  on public.food_catalog (lower(canonical_name));

create index food_catalog_aliases_gin_idx
  on public.food_catalog using gin (aliases);

create index ai_analysis_user_created_at_idx
  on public.ai_analysis (user_id, created_at desc);

create index ai_analysis_user_hash_status_idx
  on public.ai_analysis (user_id, image_sha256, status);

create index meal_records_active_user_recorded_at_idx
  on public.meal_records (user_id, recorded_at desc)
  where deleted_at is null;

create index meal_records_user_meal_type_recorded_at_idx
  on public.meal_records (user_id, meal_type, recorded_at desc);

create index meal_records_analysis_id_idx
  on public.meal_records (analysis_id);

create index meal_records_plan_id_idx
  on public.meal_records (plan_id);

create index meal_items_meal_record_id_idx
  on public.meal_items (meal_record_id);

create index meal_items_food_id_idx
  on public.meal_items (food_id);

create index coach_messages_user_context_date_idx
  on public.coach_messages (user_id, context_date desc);

create index coach_messages_user_question_date_idx
  on public.coach_messages (user_id, question_type, context_date);

create trigger set_updated_at
before update on public.users
for each row execute function public.set_updated_at();

create trigger set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

create trigger set_updated_at
before update on public.user_goals
for each row execute function public.set_updated_at();

create trigger set_updated_at
before update on public.body_profiles
for each row execute function public.set_updated_at();

create trigger set_updated_at
before update on public.nutrition_plans
for each row execute function public.set_updated_at();

create trigger set_updated_at
before update on public.food_catalog
for each row execute function public.set_updated_at();

create trigger set_updated_at
before update on public.ai_analysis
for each row execute function public.set_updated_at();

create trigger set_updated_at
before update on public.meal_records
for each row execute function public.set_updated_at();

create trigger set_updated_at
before update on public.meal_items
for each row execute function public.set_updated_at();

alter table public.users enable row level security;
alter table public.profiles enable row level security;
alter table public.user_goals enable row level security;
alter table public.body_profiles enable row level security;
alter table public.nutrition_plans enable row level security;
alter table public.food_catalog enable row level security;
alter table public.ai_analysis enable row level security;
alter table public.meal_records enable row level security;
alter table public.meal_items enable row level security;
alter table public.coach_messages enable row level security;
alter table private.wechat_identities enable row level security;

revoke all on all tables in schema public from anon;
revoke all on table private.wechat_identities from anon, authenticated;

grant usage on schema public to authenticated;

grant select on public.users,
  public.profiles,
  public.user_goals,
  public.body_profiles,
  public.nutrition_plans,
  public.food_catalog,
  public.ai_analysis,
  public.meal_records,
  public.meal_items,
  public.coach_messages
to authenticated;

grant update (nickname, avatar_path, timezone, onboarding_completed_at)
on public.profiles to authenticated;

grant insert, update, delete
on public.user_goals, public.body_profiles
to authenticated;

-- Direct client writes to users, nutrition_plans, ai_analysis, meal_records,
-- meal_items, and coach_messages are deliberately denied: Edge Functions own
-- their validation, calculation, and transactional writes.

create policy "users: users read own row"
on public.users for select
to authenticated
using ((select auth.uid()) = id);

create policy "profiles: users read own profile"
on public.profiles for select
to authenticated
using ((select auth.uid()) = id);

create policy "profiles: users update own profile"
on public.profiles for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

create policy "user goals: users read own goals"
on public.user_goals for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "user goals: users insert own goals"
on public.user_goals for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "user goals: users update own goals"
on public.user_goals for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "user goals: users delete own goals"
on public.user_goals for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "body profiles: users read own profiles"
on public.body_profiles for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "body profiles: users insert own profiles"
on public.body_profiles for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "body profiles: users update own profiles"
on public.body_profiles for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "body profiles: users delete own profiles"
on public.body_profiles for delete
to authenticated
using ((select auth.uid()) = user_id);

create policy "nutrition plans: users read own plans"
on public.nutrition_plans for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "food catalog: users read active foods"
on public.food_catalog for select
to authenticated
using (is_active = true);

create policy "ai analysis: users read own analysis"
on public.ai_analysis for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "meal records: users read own active records"
on public.meal_records for select
to authenticated
using ((select auth.uid()) = user_id and deleted_at is null);

create policy "meal items: users read own active meal items"
on public.meal_items for select
to authenticated
using (
  exists (
    select 1
    from public.meal_records as meal_record
    where meal_record.id = meal_items.meal_record_id
      and meal_record.user_id = (select auth.uid())
      and meal_record.deleted_at is null
  )
);

create policy "coach messages: users read own messages"
on public.coach_messages for select
to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'food-images',
  'food-images',
  false,
  5242880,
  array['image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "food images: users select own objects"
on storage.objects for select
to authenticated
using (
  bucket_id = 'food-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "food images: users insert own objects"
on storage.objects for insert
to authenticated
with check (bucket_id = 'food-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

create policy "food images: users delete own objects"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'food-images'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
