-- Nordic Nutri AI CloudBase PostgreSQL core schema.
-- CloudBase Auth is the platform identity; app_users maps it to the product UUID.

create schema if not exists private;

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

create table public.app_users (
  id uuid primary key default gen_random_uuid(),
  cloudbase_uid varchar(128) unique,
  status text not null default 'active'
    check (status in ('active', 'deleted', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references public.app_users(id) on delete cascade,
  nickname text check (nickname is null or char_length(nickname) between 1 and 40),
  avatar_path text,
  timezone text not null default 'Asia/Shanghai'
    check (char_length(timezone) between 1 and 64),
  onboarding_completed_at timestamptz,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_settings (
  id uuid primary key references public.app_users(id) on delete cascade,
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

create table private.identity_migrations (
  legacy_supabase_user_id uuid unique,
  legacy_openid_hash char(64) unique check (legacy_openid_hash ~ '^[0-9a-f]{64}$'),
  bound_user_id uuid unique references public.app_users(id) on delete cascade,
  cloudbase_uid varchar(128) unique,
  bound_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (legacy_supabase_user_id is not null or legacy_openid_hash is not null)
);

create table public.user_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  goal_type text not null check (goal_type in ('muscle_gain', 'fat_loss', 'maintain', 'performance')),
  target_weight_kg numeric(5, 1) check (target_weight_kg is null or target_weight_kg between 30 and 300),
  target_date date,
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.body_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  age smallint not null check (age between 14 and 80),
  birth_date date check (birth_date is null or birth_date between date '1900-01-01' and current_date),
  sex text not null check (sex in ('female', 'male', 'undisclosed')),
  height_cm numeric(5, 1) not null check (height_cm between 120 and 230),
  weight_kg numeric(5, 1) not null check (weight_kg between 30 and 300),
  activity_level text not null default 'moderate' check (activity_level in ('sedentary', 'light', 'moderate', 'high', 'very_high')),
  training_days_per_week smallint not null default 3 check (training_days_per_week between 0 and 7),
  effective_at timestamptz not null default now(),
  is_current boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.nutrition_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  goal_id uuid not null references public.user_goals(id) on delete cascade,
  body_profile_id uuid not null references public.body_profiles(id) on delete cascade,
  daily_calories_kcal numeric(6, 0) not null check (daily_calories_kcal between 800 and 10000),
  protein_g numeric(6, 1) not null check (protein_g > 0),
  carbs_g numeric(6, 1) not null check (carbs_g >= 0),
  fat_g numeric(6, 1) not null check (fat_g > 0),
  calculation_source text not null default 'formula_v1' check (calculation_source in ('formula_v1', 'manual')),
  status text not null default 'draft' check (status in ('draft', 'active', 'superseded', 'archived', 'completed')),
  version integer not null default 1 check (version > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  activated_at timestamptz,
  archived_at timestamptz,
  generation_request_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from),
  check (archived_at is null or archived_at >= created_at)
);

create table public.health_plan_items (
  id uuid primary key default gen_random_uuid(),
  nutrition_plan_id uuid not null references public.nutrition_plans(id) on delete cascade,
  sequence smallint not null check (sequence between 1 and 10),
  meal_type text check (meal_type is null or meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  target_calories_kcal numeric(6, 0) check (target_calories_kcal is null or target_calories_kcal between 0 and 10000),
  protein_g numeric(6, 1) check (protein_g is null or protein_g >= 0),
  carbs_g numeric(6, 1) check (carbs_g is null or carbs_g >= 0),
  fat_g numeric(6, 1) check (fat_g is null or fat_g >= 0),
  guidance text check (guidance is null or char_length(guidance) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (nutrition_plan_id, sequence)
);

create table public.food_catalog (
  id uuid primary key default gen_random_uuid(),
  canonical_name text not null check (char_length(btrim(canonical_name)) between 1 and 100),
  aliases text[] not null default '{}',
  serving_unit text not null default 'g' check (serving_unit in ('g', 'ml', 'piece', 'serving')),
  calories_per_100g numeric(7, 2) not null check (calories_per_100g >= 0),
  protein_g_per_100g numeric(7, 2) not null check (protein_g_per_100g >= 0),
  carbs_g_per_100g numeric(7, 2) not null check (carbs_g_per_100g >= 0),
  fat_g_per_100g numeric(7, 2) not null check (fat_g_per_100g >= 0),
  source text not null check (char_length(btrim(source)) between 1 and 200),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.uploaded_assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  bucket_id text not null check (char_length(bucket_id) between 1 and 128),
  object_path text not null check (char_length(object_path) between 1 and 512),
  content_type text not null check (content_type in ('image/jpeg', 'image/webp')),
  byte_size integer not null check (byte_size > 0 and byte_size <= 5242880),
  sha256 char(64) not null check (sha256 ~ '^[0-9a-f]{64}$'),
  status text not null default 'uploaded' check (status in ('uploaded', 'attached', 'expired', 'deleted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket_id, object_path)
);

create table public.ai_analysis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  image_path text not null check (char_length(image_path) between 1 and 512),
  image_sha256 char(64) not null check (image_sha256 ~ '^[0-9a-f]{64}$'),
  provider text not null check (char_length(btrim(provider)) between 1 and 80),
  model text not null check (char_length(btrim(model)) between 1 and 120),
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed', 'saved', 'expired')),
  confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  raw_recognition jsonb,
  normalized_items jsonb,
  advice text check (advice is null or char_length(advice) <= 1000),
  error_code text check (error_code is null or char_length(error_code) <= 80),
  client_request_id uuid,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (expires_at > created_at),
  unique (user_id, client_request_id)
);

create table public.meal_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  analysis_id uuid references public.ai_analysis(id) on delete set null,
  plan_id uuid references public.nutrition_plans(id) on delete set null,
  client_request_id uuid,
  meal_type text not null default 'snack' check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack')),
  name text not null check (char_length(btrim(name)) between 1 and 100),
  image_path text check (image_path is null or char_length(image_path) between 1 and 512),
  recorded_at timestamptz not null default now(),
  calories_kcal numeric(8, 2) not null default 0 check (calories_kcal >= 0),
  protein_g numeric(8, 2) not null default 0 check (protein_g >= 0),
  carbs_g numeric(8, 2) not null default 0 check (carbs_g >= 0),
  fat_g numeric(8, 2) not null default 0 check (fat_g >= 0),
  is_favorite boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_request_id)
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

create table public.coach_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  title text not null default '营养教练' check (char_length(btrim(title)) between 1 and 100),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  conversation_id uuid references public.coach_conversations(id) on delete cascade,
  question_type text check (question_type is null or question_type in ('protein_today', 'dinner_plan', 'muscle_gain', 'fat_loss')),
  role text not null default 'user' check (role in ('user', 'assistant', 'system')),
  content text,
  context_date date not null default current_date,
  context_snapshot jsonb,
  answer jsonb,
  provider text check (provider is null or char_length(btrim(provider)) between 1 and 80),
  model text check (model is null or char_length(btrim(model)) between 1 and 120),
  client_request_id uuid,
  created_at timestamptz not null default now(),
  unique (user_id, client_request_id)
);

create unique index user_goals_one_current_per_user_idx on public.user_goals (user_id) where is_current;
create unique index body_profiles_one_current_per_user_idx on public.body_profiles (user_id) where is_current;
create unique index nutrition_plans_one_active_per_user_idx on public.nutrition_plans (user_id) where status = 'active';
create unique index nutrition_plans_user_generation_request_idx on public.nutrition_plans (user_id, generation_request_id) where generation_request_id is not null;
create unique index food_catalog_canonical_name_lower_idx on public.food_catalog (lower(canonical_name));
create index user_goals_user_created_at_idx on public.user_goals (user_id, created_at desc);
create index body_profiles_user_effective_at_idx on public.body_profiles (user_id, effective_at desc);
create index nutrition_plans_user_status_effective_from_idx on public.nutrition_plans (user_id, status, effective_from desc);
create index meal_records_active_user_recorded_at_idx on public.meal_records (user_id, recorded_at desc) where deleted_at is null;
create index meal_items_meal_record_id_idx on public.meal_items (meal_record_id);
create index coach_messages_user_context_date_idx on public.coach_messages (user_id, context_date desc);

create or replace function private.retire_previous_current_goal()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.is_current then
    update public.user_goals set is_current = false where user_id = new.user_id and is_current;
  end if;
  return new;
end;
$$;

create or replace function private.retire_previous_current_body_profile()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.is_current then
    update public.body_profiles set is_current = false where user_id = new.user_id and is_current;
  end if;
  return new;
end;
$$;

create or replace function private.recalculate_meal_totals()
returns trigger language plpgsql set search_path = '' as $$
declare target_meal_id uuid := coalesce(new.meal_record_id, old.meal_record_id);
begin
  update public.meal_records as meal_record
  set calories_kcal = coalesce(totals.calories_kcal, 0),
      protein_g = coalesce(totals.protein_g, 0),
      carbs_g = coalesce(totals.carbs_g, 0),
      fat_g = coalesce(totals.fat_g, 0)
  from (
    select sum(confirmed_quantity_g * calories_per_100g / 100) as calories_kcal,
           sum(confirmed_quantity_g * protein_g_per_100g / 100) as protein_g,
           sum(confirmed_quantity_g * carbs_g_per_100g / 100) as carbs_g,
           sum(confirmed_quantity_g * fat_g_per_100g / 100) as fat_g
    from public.meal_items where meal_record_id = target_meal_id
  ) as totals
  where meal_record.id = target_meal_id;
  return coalesce(new, old);
end;
$$;

create trigger user_goals_retire_previous_current before insert on public.user_goals for each row execute function private.retire_previous_current_goal();
create trigger body_profiles_retire_previous_current before insert on public.body_profiles for each row execute function private.retire_previous_current_body_profile();
create trigger meal_items_recalculate_meal_totals after insert or update or delete on public.meal_items for each row execute function private.recalculate_meal_totals();

create trigger app_users_set_updated_at before update on public.app_users for each row execute function public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger user_settings_set_updated_at before update on public.user_settings for each row execute function public.set_updated_at();
create trigger user_goals_set_updated_at before update on public.user_goals for each row execute function public.set_updated_at();
create trigger body_profiles_set_updated_at before update on public.body_profiles for each row execute function public.set_updated_at();
create trigger nutrition_plans_set_updated_at before update on public.nutrition_plans for each row execute function public.set_updated_at();
create trigger health_plan_items_set_updated_at before update on public.health_plan_items for each row execute function public.set_updated_at();
create trigger food_catalog_set_updated_at before update on public.food_catalog for each row execute function public.set_updated_at();
create trigger uploaded_assets_set_updated_at before update on public.uploaded_assets for each row execute function public.set_updated_at();
create trigger ai_analysis_set_updated_at before update on public.ai_analysis for each row execute function public.set_updated_at();
create trigger meal_records_set_updated_at before update on public.meal_records for each row execute function public.set_updated_at();
create trigger meal_items_set_updated_at before update on public.meal_items for each row execute function public.set_updated_at();
create trigger coach_conversations_set_updated_at before update on public.coach_conversations for each row execute function public.set_updated_at();
create trigger identity_migrations_set_updated_at before update on private.identity_migrations for each row execute function public.set_updated_at();
