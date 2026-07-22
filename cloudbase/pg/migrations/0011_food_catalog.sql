-- Server-owned USDA food cache. The product HTTP service is the only reader
-- and writer; clients must not query the table directly.

create table if not exists public.food_catalog (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('usda_fdc', 'open_food_facts')),
  source_food_id text not null check (char_length(btrim(source_food_id)) between 1 and 128),
  description text not null check (char_length(btrim(description)) between 1 and 240),
  brand_name text check (brand_name is null or char_length(btrim(brand_name)) <= 160),
  data_type text check (data_type is null or char_length(btrim(data_type)) <= 80),
  category text check (category is null or char_length(btrim(category)) <= 160),
  serving_size numeric(10, 2) check (serving_size is null or serving_size >= 0),
  serving_unit text check (serving_unit is null or char_length(btrim(serving_unit)) <= 32),
  calories_kcal_per_100g numeric(10, 2) check (calories_kcal_per_100g is null or calories_kcal_per_100g between 0 and 2000),
  protein_g_per_100g numeric(10, 2) check (protein_g_per_100g is null or protein_g_per_100g between 0 and 200),
  carbs_g_per_100g numeric(10, 2) check (carbs_g_per_100g is null or carbs_g_per_100g between 0 and 200),
  fat_g_per_100g numeric(10, 2) check (fat_g_per_100g is null or fat_g_per_100g between 0 and 200),
  image_url text check (image_url is null or char_length(image_url) <= 2048),
  source_url text check (source_url is null or char_length(source_url) <= 2048),
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_food_id)
);

create index if not exists food_catalog_description_lower_idx
  on public.food_catalog ((lower(description)));
create index if not exists food_catalog_synced_at_idx
  on public.food_catalog (synced_at desc);

drop trigger if exists food_catalog_set_updated_at on public.food_catalog;
create trigger food_catalog_set_updated_at
  before update on public.food_catalog
  for each row execute function public.set_updated_at();

revoke all on public.food_catalog from public, anon, authenticated;
alter table public.food_catalog enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'food_catalog' and policyname = 'food catalog: server only'
  ) then
    create policy "food catalog: server only" on public.food_catalog
      for all to public using (false) with check (false);
  end if;
end
$$;
