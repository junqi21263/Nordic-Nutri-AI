-- Separate visual appearances from nutrition variants.  One canonical food can
-- own several visual profiles (for example raw chicken breast and plainly
-- cooked chicken breast), while every nutrition variant points at one profile.

alter table public.foods
  add column if not exists image_owner_food_id uuid references public.foods(id) on delete set null,
  add column if not exists visual_profile_key text not null default 'standard'
    check (visual_profile_key in ('standard', 'raw', 'cooked_plain', 'fresh', 'dry'));

-- Grouped nutrition variants share the primary variant as their image owner.
with canonical as (
  select distinct on (food_group_id) id, food_group_id
  from public.foods
  where food_group_id is not null
  order by food_group_id, is_primary_variant desc, created_at asc
)
update public.foods f
set image_owner_food_id = coalesce(c.id, f.id)
from canonical c
where f.food_group_id = c.food_group_id
  and f.image_owner_food_id is distinct from coalesce(c.id, f.id);

update public.foods
set image_owner_food_id = id
where image_owner_food_id is null;

-- A conservative automatic default. Operators can explicitly request a
-- different profile in the batch console without creating another food row.
update public.foods f
set visual_profile_key = case
  when concat_ws(' ', f.variant_label_zh, f.default_cooking_method, f.food_form, f.name_zh, f.name_en) ~* '(熟制|熟食|水煮|白灼|清蒸|蒸制|炖煮|煮熟|cooked|boiled|steamed)' then 'cooked_plain'
  when concat_ws(' ', f.variant_label_zh, f.default_cooking_method, f.food_form, f.name_zh, f.name_en) ~* '(干制|干货|风干|晒干|dried|dehydrated)' then 'dry'
  when concat_ws(' ', f.name_zh, f.name_en, coalesce((select c.code from public.food_categories c where c.id = f.category_id), '')) ~* '(肉禽|牛肉|猪肉|羊肉|鸡肉|鸡胸|火鸡|鱼虾海鲜|海鲜|三文鱼|金枪鱼|虾|蟹|贝类|meat|poultry|seafood|fish|shellfish)' then 'raw'
  when concat_ws(' ', f.name_zh, f.name_en, coalesce((select c.code from public.food_categories c where c.id = f.category_id), '')) ~* '(蔬菜|水果|番茄|菠菜|西兰花|叶菜|根茎|苹果|香蕉|牛油果|蓝莓|vegetable|fruit)' then 'fresh'
  when concat_ws(' ', f.name_zh, f.name_en, coalesce((select c.code from public.food_categories c where c.id = f.category_id), '')) ~* '(谷物|坚果|种子|燕麦|米|麦|豆类|干豆|grain|nut|seed)' then 'dry'
  else 'standard'
end;

create table if not exists public.food_image_visual_profiles (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.foods(id) on delete cascade,
  profile_key text not null check (profile_key in ('standard', 'raw', 'cooked_plain', 'fresh', 'dry')),
  label_zh text not null check (char_length(btrim(label_zh)) between 1 and 32),
  prompt_hint text not null default '' check (char_length(prompt_hint) <= 240),
  is_default boolean not null default false,
  primary_image_id uuid references public.food_images(id) on delete set null,
  status text not null default 'missing' check (status in ('missing', 'generating', 'reviewing', 'ready', 'failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (food_id, profile_key)
);

create unique index if not exists food_image_visual_profiles_one_default_idx
  on public.food_image_visual_profiles (food_id) where is_default;
create index if not exists food_image_visual_profiles_food_status_idx
  on public.food_image_visual_profiles (food_id, status);

insert into public.food_image_visual_profiles (food_id, profile_key, label_zh, prompt_hint, is_default, status)
select f.id,
  f.visual_profile_key,
  case f.visual_profile_key
    when 'raw' then '生鲜原料'
    when 'cooked_plain' then '清淡熟制'
    when 'fresh' then '新鲜食材'
    when 'dry' then '干制原料'
    else '默认食材'
  end,
  '',
  true,
  case when f.primary_image_id is not null then 'ready' else 'missing' end
from public.foods f
where f.id = f.image_owner_food_id
on conflict (food_id, profile_key) do nothing;

-- Preserve historical images that were attached directly to a nutrition
-- variant. They become non-default appearances of the canonical food instead
-- of being hidden behind its default profile after this migration.
insert into public.food_image_visual_profiles (food_id, profile_key, label_zh, prompt_hint, is_default, status)
select distinct f.image_owner_food_id,
  f.visual_profile_key,
  case f.visual_profile_key
    when 'raw' then '生鲜原料'
    when 'cooked_plain' then '清淡熟制'
    when 'fresh' then '新鲜食材'
    when 'dry' then '干制原料'
    else '默认食材'
  end,
  '',
  false,
  case when image.status = 'ready' then 'ready' else 'missing' end
from public.foods f
join public.food_images image on image.food_id = f.id
where f.image_owner_food_id is not null
on conflict (food_id, profile_key) do nothing;

alter table public.food_images
  add column if not exists visual_profile_id uuid references public.food_image_visual_profiles(id) on delete set null;

update public.food_images image
set visual_profile_id = profile.id
from public.foods food
join public.food_image_visual_profiles profile
  on profile.food_id = food.image_owner_food_id
 and profile.profile_key = food.visual_profile_key
where image.food_id = food.id
  and image.visual_profile_id is null;

-- Historical nutrition variants can each have retained an is_primary image.
-- Keep every image, but choose one stable primary before enforcing the new
-- per-visual-profile uniqueness rule.
with food_images_ranked_for_visual_profile as (
  select id,
    row_number() over (
      partition by visual_profile_id
      order by
        (status = 'ready') desc,
        (review_status = 'approved') desc,
        created_at asc,
        id asc
    ) as primary_rank
  from public.food_images
  where visual_profile_id is not null
    and is_primary
)
update public.food_images image
set is_primary = false
from food_images_ranked_for_visual_profile ranked
where image.id = ranked.id
  and ranked.primary_rank > 1;

update public.food_image_visual_profiles profile
set primary_image_id = image.id,
    status = 'ready'
from public.food_images image
where image.visual_profile_id = profile.id
  and image.is_primary
  and image.status = 'ready'
  and (image.review_status is null or image.review_status = 'approved');

drop index if exists public.food_images_one_primary_per_food_idx;
create unique index if not exists food_images_one_primary_per_profile_idx
  on public.food_images (visual_profile_id)
  where is_primary and visual_profile_id is not null;

alter table public.food_image_jobs
  add column if not exists visual_profile_id uuid references public.food_image_visual_profiles(id) on delete set null,
  add column if not exists visual_profile_key text not null default 'standard'
    check (visual_profile_key in ('standard', 'raw', 'cooked_plain', 'fresh', 'dry'));

update public.food_image_jobs job
set visual_profile_id = profile.id,
    visual_profile_key = profile.profile_key
from public.foods food
join public.food_image_visual_profiles profile
  on profile.food_id = food.image_owner_food_id
 and profile.profile_key = food.visual_profile_key
where job.food_id = food.id
  and job.visual_profile_id is null;

drop index if exists public.food_image_jobs_one_active_per_food_idx;
create unique index if not exists food_image_jobs_one_active_per_profile_idx
  on public.food_image_jobs (visual_profile_id)
  where status in ('pending', 'processing') and job_type in ('generate', 'regenerate') and visual_profile_id is not null;
create index if not exists food_image_jobs_profile_idx
  on public.food_image_jobs (visual_profile_id, created_at desc);

alter table public.food_image_batch_items
  add column if not exists visual_profile_id uuid references public.food_image_visual_profiles(id) on delete set null,
  add column if not exists visual_profile_key text not null default 'standard'
    check (visual_profile_key in ('standard', 'raw', 'cooked_plain', 'fresh', 'dry')),
  add column if not exists visual_profile_label_zh text not null default '默认食材'
    check (char_length(btrim(visual_profile_label_zh)) between 1 and 32);

update public.food_image_batch_items item
set visual_profile_id = profile.id,
    visual_profile_key = profile.profile_key,
    visual_profile_label_zh = profile.label_zh
from public.foods food
join public.food_image_visual_profiles profile
  on profile.food_id = food.image_owner_food_id
 and profile.profile_key = food.visual_profile_key
where item.food_id = food.id
  and item.visual_profile_id is null;

alter table public.food_image_batch_items
  drop constraint if exists food_image_batch_items_batch_id_food_id_key;
alter table public.food_image_batch_items
  add constraint food_image_batch_items_batch_food_profile_key
  unique (batch_id, food_id, visual_profile_key);

drop index if exists public.food_image_batch_items_one_active_food_idx;
create unique index if not exists food_image_batch_items_one_active_food_profile_idx
  on public.food_image_batch_items (food_id, visual_profile_key)
  where status in ('pending', 'generating', 'needs_retry');

drop trigger if exists food_image_visual_profiles_set_updated_at on public.food_image_visual_profiles;
create trigger food_image_visual_profiles_set_updated_at
  before update on public.food_image_visual_profiles
  for each row execute function public.set_updated_at();

do $$
begin
  revoke all on public.food_image_visual_profiles from public, anon, authenticated;
  alter table public.food_image_visual_profiles enable row level security;
  drop policy if exists "food_image_visual_profiles: server only" on public.food_image_visual_profiles;
  create policy "food_image_visual_profiles: server only" on public.food_image_visual_profiles for all to public using (false) with check (false);
end $$;
