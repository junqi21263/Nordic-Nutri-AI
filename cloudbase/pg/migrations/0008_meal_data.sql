-- Server-owned meal data. The product session service is the only application
-- writer, so client roles receive no direct access to these tables.

create table if not exists public.ai_analysis (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  -- Manual records have no image source; scanner records may supply both fields.
  image_path text check (image_path is null or char_length(image_path) between 1 and 512),
  image_sha256 char(64) check (image_sha256 is null or image_sha256 ~ '^[0-9a-f]{64}$'),
  provider text not null check (char_length(btrim(provider)) between 1 and 80),
  model text not null check (char_length(btrim(model)) between 1 and 120),
  status text not null default 'succeeded' check (status in ('pending', 'processing', 'succeeded', 'failed', 'saved', 'expired')),
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

create table if not exists public.meal_records (
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

create table if not exists public.meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_record_id uuid not null references public.meal_records(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  ai_quantity_g numeric(8, 1) check (ai_quantity_g is null or ai_quantity_g between 0 and 2000),
  confirmed_quantity_g numeric(8, 1) not null check (confirmed_quantity_g between 0 and 2000),
  calories_per_100g numeric(8, 2) not null check (calories_per_100g between 0 and 2000),
  protein_g_per_100g numeric(8, 2) not null check (protein_g_per_100g between 0 and 2000),
  carbs_g_per_100g numeric(8, 2) not null check (carbs_g_per_100g between 0 and 2000),
  fat_g_per_100g numeric(8, 2) not null check (fat_g_per_100g between 0 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The original core schema required image metadata. Text-only DeepSeek
-- analysis also uses this table, so both fields must be nullable.
alter table public.ai_analysis alter column image_path drop not null;
alter table public.ai_analysis alter column image_sha256 drop not null;
alter table public.ai_analysis alter column status set default 'succeeded';

create index if not exists ai_analysis_user_created_at_idx on public.ai_analysis (user_id, created_at desc);
create index if not exists meal_records_active_user_recorded_at_idx on public.meal_records (user_id, recorded_at desc) where deleted_at is null;
create index if not exists meal_items_meal_record_id_idx on public.meal_items (meal_record_id);

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

drop trigger if exists ai_analysis_set_updated_at on public.ai_analysis;
drop trigger if exists meal_records_set_updated_at on public.meal_records;
drop trigger if exists meal_items_set_updated_at on public.meal_items;
drop trigger if exists meal_items_recalculate_meal_totals on public.meal_items;
create trigger ai_analysis_set_updated_at before update on public.ai_analysis for each row execute function public.set_updated_at();
create trigger meal_records_set_updated_at before update on public.meal_records for each row execute function public.set_updated_at();
create trigger meal_items_set_updated_at before update on public.meal_items for each row execute function public.set_updated_at();
create trigger meal_items_recalculate_meal_totals after insert or update or delete on public.meal_items for each row execute function private.recalculate_meal_totals();

revoke all on public.ai_analysis from public, anon, authenticated;
revoke all on public.meal_records from public, anon, authenticated;
revoke all on public.meal_items from public, anon, authenticated;
alter table public.ai_analysis enable row level security;
alter table public.meal_records enable row level security;
alter table public.meal_items enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_analysis' and policyname = 'ai analysis: server only'
  ) then
    create policy "ai analysis: server only" on public.ai_analysis
      for all to public using (false) with check (false);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'meal_records' and policyname = 'meal records: server only'
  ) then
    create policy "meal records: server only" on public.meal_records
      for all to public using (false) with check (false);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'meal_items' and policyname = 'meal items: server only'
  ) then
    create policy "meal items: server only" on public.meal_items
      for all to public using (false) with check (false);
  end if;
end
$$;
