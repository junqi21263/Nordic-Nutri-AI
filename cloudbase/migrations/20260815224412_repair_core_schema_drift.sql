-- Repair migration for the partial application of 0001_core_schema.sql.
-- Canonical definitions are copied from that migration without redesign.

create table if not exists public.health_plan_items (
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
create table if not exists public.uploaded_assets (
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
create trigger health_plan_items_set_updated_at
before update on public.health_plan_items
for each row execute function public.set_updated_at();
create trigger uploaded_assets_set_updated_at
before update on public.uploaded_assets
for each row execute function public.set_updated_at();
