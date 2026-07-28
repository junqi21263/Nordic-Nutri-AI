-- Regional food lenses. A food keeps its canonical nutrition category and may
-- additionally belong to one or both regional views.
create table if not exists public.food_region_memberships (
  food_id uuid not null references public.foods(id) on delete cascade,
  region_code text not null check (region_code in ('nordic_staples', 'north_american_staples')),
  source text not null default 'curated_rule' check (source in ('curated_rule', 'manual')),
  created_at timestamptz not null default now(),
  primary key (food_id, region_code)
);

create index if not exists food_region_memberships_region_idx
  on public.food_region_memberships (region_code, food_id);

alter table public.food_region_memberships enable row level security;
revoke all on public.food_region_memberships from public, anon, authenticated;
drop policy if exists "food_region_memberships: server only" on public.food_region_memberships;
create policy "food_region_memberships: server only"
  on public.food_region_memberships for all to public using (false) with check (false);

insert into public.food_categories (code, name_zh, name_en, icon, sort_order, is_active)
values
  ('nordic_staples', '北欧常见食材', 'Nordic staples', 'food-fish', 13, true),
  ('north_american_staples', '北美常见食材', 'North American staples', 'food-bowl', 14, true)
on conflict (code) do update set
  name_zh = excluded.name_zh,
  name_en = excluded.name_en,
  icon = excluded.icon,
  sort_order = excluded.sort_order,
  is_active = excluded.is_active,
  updated_at = now();

-- Retire the legacy duplicate roots. Their food rows remain intact; the
-- canonical v2 roots and their descendants are the only public category chips.
update public.food_categories
set is_active = false, updated_at = now()
where code in ('meat', 'egg', 'dairy', 'soy', 'grain', 'vegetable', 'fruit',
               'beverage', 'seasoning', 'mixed_dish', 'other');

with food_names as (
  select
    id,
    lower(concat_ws(' ', name_en, normalized_name, description, array_to_string(search_keywords, ' '))) as text
  from public.foods
  where is_active = true and publish_status = 'published'
), regional_matches as (
  select id, 'nordic_staples' as region_code
  from food_names
  where text ~ '(salmon|cod|herring|mackerel|trout|arctic char|rye|barley|oat|skyr|lingonberry|cloudberry|cranberry|rapeseed|canola|dill|beet|cabbage|potato|mushroom|pea|venison|reindeer)'
  union all
  select id, 'north_american_staples' as region_code
  from food_names
  where text ~ '(turkey|corn|maize|maple|peanut butter|pecan|avocado|pumpkin|sweet potato|quinoa|black bean|pinto bean|kale|cranberry|blueberry|cheddar|ranch|oat|potato|salmon|beef|chicken)'
)
insert into public.food_region_memberships (food_id, region_code, source)
select id, region_code, 'curated_rule'
from regional_matches
on conflict (food_id, region_code) do update set source = excluded.source;
