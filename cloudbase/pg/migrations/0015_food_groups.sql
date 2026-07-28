-- Food groups keep source nutrition rows intact while presenting one primary
-- catalog item per displayed food name. Non-primary rows remain available as
-- variants from the food detail page.
create table if not exists public.food_groups (
  id uuid primary key default gen_random_uuid(),
  normalized_key text not null unique,
  canonical_name_zh text,
  canonical_name_en text,
  category_id uuid references public.food_categories(id) on delete set null,
  primary_food_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.foods
  add column if not exists food_group_id uuid references public.food_groups(id) on delete set null,
  add column if not exists is_primary_variant boolean not null default true,
  add column if not exists variant_label_zh text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'food_groups_primary_food_id_fkey'
      and conrelid = 'public.food_groups'::regclass
  ) then
    alter table public.food_groups
      add constraint food_groups_primary_food_id_fkey
      foreign key (primary_food_id) references public.foods(id) on delete set null;
  end if;
end $$;

create index if not exists food_groups_category_idx
  on public.food_groups (category_id, is_active);
create index if not exists foods_food_group_idx
  on public.foods (food_group_id, is_primary_variant)
  where is_active = true and publish_status = 'published';
create index if not exists foods_primary_catalog_idx
  on public.foods (is_primary_variant, category_id, popularity_score desc, id)
  where is_active = true and publish_status = 'published';

-- Build groups from the user-facing name. This intentionally groups same-name
-- records even when USDA source ids or canonical keys differ; their nutrition
-- differences are exposed as variants rather than silently discarded.
insert into public.food_groups (normalized_key, canonical_name_zh, canonical_name_en)
select
  case lower(btrim(coalesce(nullif(name_zh, ''), nullif(normalized_name, ''), nullif(name_en, ''), id::text)))
    when 'beef' then '牛肉'
    when 'chicken' then '鸡肉'
    when 'pork' then '猪肉'
    when 'turkey' then '火鸡肉'
    when 'duck' then '鸭肉'
    when 'lamb' then '羊肉'
    when 'salmon' then '三文鱼'
    when 'tuna' then '金枪鱼'
    when 'shrimp' then '虾'
    when 'prawn' then '虾'
    when 'crab' then '螃蟹'
    when 'egg' then '鸡蛋'
    when 'milk' then '牛奶'
    when 'yogurt' then '酸奶'
    when 'yoghurt' then '酸奶'
    when 'cheese' then '奶酪'
    when 'tofu' then '豆腐'
    when 'rice' then '米饭'
    when 'oat' then '燕麦'
    when 'bread' then '面包'
    when 'pasta' then '意面'
    when 'potato' then '土豆'
    when 'apple' then '苹果'
    when 'banana' then '香蕉'
    when 'orange' then '橙子'
    when 'tomato' then '番茄'
    when 'mushroom' then '蘑菇'
    when 'avocado' then '牛油果'
    else lower(btrim(coalesce(nullif(name_zh, ''), nullif(normalized_name, ''), nullif(name_en, ''), id::text)))
  end as normalized_key,
  min(nullif(btrim(name_zh), '')) as canonical_name_zh,
  min(nullif(btrim(name_en), '')) as canonical_name_en
from public.foods
where is_active = true and publish_status = 'published'
group by 1
on conflict (normalized_key) do update set
  canonical_name_zh = coalesce(public.food_groups.canonical_name_zh, excluded.canonical_name_zh),
  canonical_name_en = coalesce(public.food_groups.canonical_name_en, excluded.canonical_name_en),
  updated_at = now();

update public.foods f
set food_group_id = g.id
from public.food_groups g
where f.is_active = true
  and f.publish_status = 'published'
  and g.normalized_key = case lower(btrim(coalesce(nullif(f.name_zh, ''), nullif(f.normalized_name, ''), nullif(f.name_en, ''), f.id::text)))
    when 'beef' then '牛肉'
    when 'chicken' then '鸡肉'
    when 'pork' then '猪肉'
    when 'turkey' then '火鸡肉'
    when 'duck' then '鸭肉'
    when 'lamb' then '羊肉'
    when 'salmon' then '三文鱼'
    when 'tuna' then '金枪鱼'
    when 'shrimp' then '虾'
    when 'prawn' then '虾'
    when 'crab' then '螃蟹'
    when 'egg' then '鸡蛋'
    when 'milk' then '牛奶'
    when 'yogurt' then '酸奶'
    when 'yoghurt' then '酸奶'
    when 'cheese' then '奶酪'
    when 'tofu' then '豆腐'
    when 'rice' then '米饭'
    when 'oat' then '燕麦'
    when 'bread' then '面包'
    when 'pasta' then '意面'
    when 'potato' then '土豆'
    when 'apple' then '苹果'
    when 'banana' then '香蕉'
    when 'orange' then '橙子'
    when 'tomato' then '番茄'
    when 'mushroom' then '蘑菇'
    when 'avocado' then '牛油果'
    else lower(btrim(coalesce(nullif(f.name_zh, ''), nullif(f.normalized_name, ''), nullif(f.name_en, ''), f.id::text)))
  end;

-- Prefer a useful, unbranded, verified row as the primary display item. The
-- id tie-breaker keeps the result deterministic across repeated backfills.
with ranked as (
  select
    f.id,
    row_number() over (
      partition by f.food_group_id
      order by
        (f.name_zh is not null) desc,
        f.is_verified desc,
        f.is_featured desc,
        (f.brand_name is null) desc,
        f.quality_score desc,
        f.image_quality_score desc nulls last,
        f.popularity_score desc,
        f.id
    ) as position
  from public.foods f
  where f.is_active = true
    and f.publish_status = 'published'
    and f.food_group_id is not null
)
update public.foods f
set
  is_primary_variant = ranked.position = 1,
  variant_label_zh = case
    when ranked.position = 1 then null
    else coalesce(
      nullif(btrim(f.food_form), ''),
      nullif(btrim(f.default_cooking_method), ''),
      nullif(btrim(f.brand_name), ''),
      nullif(btrim(f.name_en), ''),
      '其他营养版本'
    )
  end,
  updated_at = now()
from ranked
where f.id = ranked.id;

update public.food_groups g
set
  primary_food_id = f.id,
  category_id = f.category_id,
  canonical_name_zh = coalesce(nullif(btrim(f.name_zh), ''), g.canonical_name_zh),
  canonical_name_en = coalesce(nullif(btrim(f.name_en), ''), g.canonical_name_en),
  updated_at = now()
from public.foods f
where f.food_group_id = g.id
  and f.is_primary_variant = true;

-- Regional lenses should point at the visible primary item after grouping.
-- This only rewrites derived membership rows; the original food rows remain.
with mapped as (
  select
    coalesce(primary_food.id, member_food.id) as food_id,
    memberships.region_code,
    memberships.source
  from public.food_region_memberships memberships
  join public.foods member_food on member_food.id = memberships.food_id
  left join public.foods primary_food
    on primary_food.food_group_id = member_food.food_group_id
   and primary_food.is_primary_variant = true
)
insert into public.food_region_memberships (food_id, region_code, source)
select distinct on (food_id, region_code) food_id, region_code, source
from mapped
on conflict (food_id, region_code) do nothing;

delete from public.food_region_memberships memberships
using public.foods member_food, public.foods primary_food
where memberships.food_id = member_food.id
  and member_food.food_group_id = primary_food.food_group_id
  and primary_food.is_primary_variant = true
  and member_food.id <> primary_food.id;

alter table public.food_groups enable row level security;
revoke all on public.food_groups from public, anon, authenticated;
drop policy if exists "food_groups: server only" on public.food_groups;
create policy "food_groups: server only"
  on public.food_groups for all to public using (false) with check (false);
