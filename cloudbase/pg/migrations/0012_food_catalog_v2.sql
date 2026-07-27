-- Nordic Nutri AI unified food data model.
-- Introduces canonical foods / categories / tags / images / source payloads /
-- sync jobs / image tasks alongside the existing food_catalog cache table.
-- All tables are server-only (the HTTP cloud function is the sole reader/writer),
-- matching the deny-all RLS pattern used by food_catalog, meal_records, etc.

-- Trigram + btree_gin support for Chinese/English prefix and fuzzy search.
create extension if not exists pg_trgm;

-- Admin flag reused by the function's admin gate. Defaults to false; operators
-- promote a user via SQL or the CloudBase MCP console.
alter table public.app_users
  add column if not exists is_admin boolean not null default false;

-- 1. food_categories ------------------------------------------------------
create table if not exists public.food_categories (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code = btrim(lower(code)) and char_length(code) between 1 and 32),
  name_zh text not null check (char_length(btrim(name_zh)) between 1 and 40),
  name_en text check (name_en is null or char_length(btrim(name_en)) between 1 and 80),
  icon text check (icon is null or char_length(icon) <= 64),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code)
);

-- 2. food_tags ------------------------------------------------------------
create table if not exists public.food_tags (
  id uuid primary key default gen_random_uuid(),
  code text not null check (code = btrim(lower(code)) and char_length(code) between 1 and 32),
  name_zh text not null check (char_length(btrim(name_zh)) between 1 and 40),
  name_en text check (name_en is null or char_length(btrim(name_en)) between 1 and 80),
  rule_config jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (code)
);

-- 3. foods ----------------------------------------------------------------
create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  source text not null check (source in ('manual','usda','open_food_facts','ai_scan','user_upload','fixture')),
  source_id text not null check (char_length(btrim(source_id)) between 1 and 128),
  fdc_id bigint unique,
  barcode text unique check (barcode is null or char_length(btrim(barcode)) between 1 and 64),
  name_zh text check (name_zh is null or char_length(btrim(name_zh)) between 1 and 160),
  name_en text check (name_en is null or char_length(btrim(name_en)) between 1 and 240),
  normalized_name text not null check (char_length(btrim(normalized_name)) between 1 and 240),
  brand_name text check (brand_name is null or char_length(btrim(brand_name)) <= 160),
  description text check (description is null or char_length(description) <= 600),
  category_id uuid references public.food_categories(id) on delete set null,
  serving_size numeric(10, 2) check (serving_size is null or serving_size >= 0),
  serving_unit text check (serving_unit is null or char_length(btrim(serving_unit)) <= 32),
  calories numeric(10, 2) not null check (calories >= 0),
  protein_g numeric(10, 2) not null check (protein_g >= 0),
  carbs_g numeric(10, 2) not null check (carbs_g >= 0),
  fat_g numeric(10, 2) not null check (fat_g >= 0),
  fiber_g numeric(10, 2) check (fiber_g is null or fiber_g >= 0),
  sugar_g numeric(10, 2) check (sugar_g is null or sugar_g >= 0),
  sodium_mg numeric(10, 2) check (sodium_mg is null or sodium_mg >= 0),
  nutrition_basis text not null default 'per_100g' check (nutrition_basis in ('per_100g','per_serving')),
  image_entity_key text check (image_entity_key is null or char_length(image_entity_key) <= 128),
  primary_image_id uuid,
  search_keywords text[] not null default '{}',
  popularity_score numeric(6, 2) not null default 0 check (popularity_score >= 0),
  quality_score numeric(4, 2) not null default 0 check (quality_score between 0 and 100),
  is_featured boolean not null default false,
  is_verified boolean not null default false,
  is_active boolean not null default true,
  raw_source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_id)
);

-- 4. food_tag_relations ---------------------------------------------------
create table if not exists public.food_tag_relations (
  food_id uuid not null references public.foods(id) on delete cascade,
  tag_id uuid not null references public.food_tags(id) on delete cascade,
  source text not null default 'manual' check (source in ('manual','rule')),
  created_at timestamptz not null default now(),
  primary key (food_id, tag_id)
);

-- 5. food_images ----------------------------------------------------------
create table if not exists public.food_images (
  id uuid primary key default gen_random_uuid(),
  food_id uuid references public.foods(id) on delete set null,
  image_entity_key text check (image_entity_key is null or char_length(image_entity_key) <= 128),
  image_type text not null check (image_type in ('ingredient','prepared','packaged','dish','placeholder')),
  source text not null check (source in ('manual','open_food_facts','user_upload','ai_generated','licensed_stock')),
  source_url text check (source_url is null or char_length(source_url) <= 2048),
  storage_path text check (storage_path is null or char_length(storage_path) <= 512),
  thumb_url text check (thumb_url is null or char_length(thumb_url) <= 2048),
  medium_url text check (medium_url is null or char_length(medium_url) <= 2048),
  detail_url text check (detail_url is null or char_length(detail_url) <= 2048),
  mime_type text check (mime_type is null or char_length(mime_type) <= 64),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  file_size bigint check (file_size is null or file_size >= 0),
  content_hash char(64) unique,
  license text check (license is null or char_length(license) <= 80),
  attribution text check (attribution is null or char_length(attribution) <= 240),
  quality_score numeric(4, 2) check (quality_score is null or quality_score between 0 and 100),
  is_primary boolean not null default false,
  is_verified boolean not null default false,
  status text not null default 'pending' check (status in ('pending','processing','ready','failed','rejected')),
  uploaded_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Only one primary image per food.
create unique index if not exists food_images_one_primary_per_food_idx
  on public.food_images (food_id) where is_primary and food_id is not null;

-- 6. food_source_payloads -------------------------------------------------
create table if not exists public.food_source_payloads (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.foods(id) on delete cascade,
  source text not null check (source in ('usda','open_food_facts','ai_scan')),
  source_id text not null check (char_length(btrim(source_id)) between 1 and 128),
  raw_payload jsonb not null,
  fetched_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (source, source_id)
);

-- 7. food_sync_jobs -------------------------------------------------------
create table if not exists public.food_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null check (job_type in ('usda_import','open_food_facts_import','image_sync','backfill')),
  source text not null,
  status text not null default 'pending' check (status in ('pending','running','succeeded','failed','partial')),
  request_payload jsonb,
  result_summary jsonb,
  total_count integer not null default 0,
  success_count integer not null default 0,
  failed_count integer not null default 0,
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

-- 8. food_image_tasks -----------------------------------------------------
create table if not exists public.food_image_tasks (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.foods(id) on delete cascade,
  image_entity_key text check (image_entity_key is null or char_length(image_entity_key) <= 128),
  source_priority text not null check (source_priority in ('manual','open_food_facts','user_upload','ai_generated','category_placeholder')),
  status text not null default 'pending' check (status in ('pending','processing','ready','failed','rejected')),
  retry_count integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Indexes -----------------------------------------------------------------
create index if not exists foods_name_zh_trigram_idx on public.foods using gin (name_zh gin_trgm_ops);
create index if not exists foods_name_en_trigram_idx on public.foods using gin (name_en gin_trgm_ops);
create index if not exists foods_normalized_name_trigram_idx on public.foods using gin (normalized_name gin_trgm_ops);
create index if not exists foods_search_keywords_idx on public.foods using gin (search_keywords);
create index if not exists foods_barcode_idx on public.foods (barcode) where barcode is not null;
create index if not exists foods_fdc_id_idx on public.foods (fdc_id) where fdc_id is not null;
create index if not exists foods_category_idx on public.foods (category_id);
create index if not exists foods_featured_idx on public.foods (is_featured) where is_featured;
create index if not exists foods_popularity_idx on public.foods (popularity_score desc);
create index if not exists foods_created_at_idx on public.foods (created_at desc);
create index if not exists foods_active_verified_idx on public.foods (is_active, is_verified);
create index if not exists food_tag_relations_tag_idx on public.food_tag_relations (tag_id);
create index if not exists food_images_food_idx on public.food_images (food_id);
create index if not exists food_images_entity_key_idx on public.food_images (image_entity_key) where image_entity_key is not null;
create index if not exists food_images_status_idx on public.food_images (status);
create index if not exists food_source_payloads_food_idx on public.food_source_payloads (food_id);
create index if not exists food_sync_jobs_status_idx on public.food_sync_jobs (status, created_at desc);
create index if not exists food_image_tasks_status_idx on public.food_image_tasks (status, created_at);
create index if not exists app_users_is_admin_idx on public.app_users (id) where is_admin;

-- Triggers ----------------------------------------------------------------
drop trigger if exists food_categories_set_updated_at on public.food_categories;
create trigger food_categories_set_updated_at
  before update on public.food_categories
  for each row execute function public.set_updated_at();

drop trigger if exists food_tags_set_updated_at on public.food_tags;
create trigger food_tags_set_updated_at
  before update on public.food_tags
  for each row execute function public.set_updated_at();

drop trigger if exists foods_set_updated_at on public.foods;
create trigger foods_set_updated_at
  before update on public.foods
  for each row execute function public.set_updated_at();

drop trigger if exists food_images_set_updated_at on public.food_images;
create trigger food_images_set_updated_at
  before update on public.food_images
  for each row execute function public.set_updated_at();

drop trigger if exists food_image_tasks_set_updated_at on public.food_image_tasks;
create trigger food_image_tasks_set_updated_at
  before update on public.food_image_tasks
  for each row execute function public.set_updated_at();

-- RLS: server-only (deny all client access) -------------------------------
do $$
declare t text;
begin
  for t in (
    select unnest(array[
      'food_categories','food_tags','foods','food_tag_relations',
      'food_images','food_source_payloads','food_sync_jobs','food_image_tasks'
    ])
  )
  loop
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format(
      'drop policy if exists "%1$s: server only" on public.%1$s', t
    );
    execute format(
      'create policy "%1$s: server only" on public.%1$s for all to public using (false) with check (false)', t
    );
  end loop;
end $$;

-- Seed categories ---------------------------------------------------------
insert into public.food_categories (code, name_zh, name_en, icon, sort_order, is_active)
values
  ('meat','肉禽','Meat & poultry','meat',1,true),
  ('seafood','鱼虾海鲜','Seafood','seafood',2,true),
  ('egg','蛋类','Eggs','egg',3,true),
  ('dairy','乳制品','Dairy','dairy',4,true),
  ('soy','豆制品','Soy products','soy',5,true),
  ('grain','谷物','Grains','grain',6,true),
  ('vegetable','蔬菜','Vegetables','vegetable',7,true),
  ('fruit','水果','Fruits','fruit',8,true),
  ('beverage','饮料','Beverages','beverage',9,true),
  ('seasoning','调味品','Seasonings','seasoning',10,true),
  ('mixed_dish','混合菜','Mixed dishes','mixed_dish',11,true),
  ('other','其他','Other','other',12,true)
on conflict (code) do update set
  name_zh = excluded.name_zh,
  name_en = excluded.name_en,
  icon = excluded.icon,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

-- Seed tags ---------------------------------------------------------------
insert into public.food_tags (code, name_zh, name_en, rule_config, sort_order, is_active)
values
  ('high_protein','高蛋白','High protein','{"type":"protein_gte","threshold":15}'::jsonb,1,true),
  ('low_fat','低脂','Low fat','{"type":"fat_lte","threshold":3}'::jsonb,2,true),
  ('high_carb','高碳水','High carb','{"type":"carbs_gte","threshold":30}'::jsonb,3,true),
  ('low_calorie','低热量','Low calorie','{"type":"calories_lte","threshold":100}'::jsonb,4,true),
  ('plant_protein','植物蛋白','Plant protein','{"type":"category_in","categories":["soy","grain"]}'::jsonb,5,true),
  ('high_fiber','高膳食纤维','High fiber','{"type":"fiber_gte","threshold":5}'::jsonb,6,true)
on conflict (code) do update set
  name_zh = excluded.name_zh,
  name_en = excluded.name_en,
  rule_config = excluded.rule_config,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

-- Backfill foods from the legacy food_catalog cache -----------------------
insert into public.foods (
  source, source_id, fdc_id, barcode, name_zh, name_en, normalized_name,
  brand_name, description, category_id, serving_size, serving_unit,
  calories, protein_g, carbs_g, fat_g, nutrition_basis, image_entity_key,
  search_keywords, popularity_score, quality_score, is_featured, is_verified,
  is_active, raw_source_updated_at
)
select
  case fc.source when 'usda_fdc' then 'usda' else 'open_food_facts' end,
  fc.source_food_id,
  case when fc.source = 'usda_fdc' and fc.source_food_id ~ '^[0-9]+$'
       then fc.source_food_id::bigint else null end,
  null,
  null,
  fc.description,
  lower(btrim(fc.description)),
  fc.brand_name,
  fc.description,
  null,
  fc.serving_size,
  fc.serving_unit,
  coalesce(fc.calories_kcal_per_100g, 0),
  coalesce(fc.protein_g_per_100g, 0),
  coalesce(fc.carbs_g_per_100g, 0),
  coalesce(fc.fat_g_per_100g, 0),
  'per_100g',
  fc.source_food_id,
  string_to_array(lower(regexp_replace(btrim(fc.description), '[\s,./()-]+',' ','g')), ' '),
  0,
  0,
  false,
  false,
  true,
  fc.synced_at
from public.food_catalog fc
where not exists (
  select 1 from public.foods f
  where f.source = (case fc.source when 'usda_fdc' then 'usda' else 'open_food_facts' end)
    and f.source_id = fc.source_food_id
)
on conflict (source, source_id) do nothing;
