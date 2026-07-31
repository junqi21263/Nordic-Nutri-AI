-- Refresh Nordic / North-American regional lenses for foods imported after 0014.
-- Memberships are additive lenses; each food keeps its canonical nutrition category.

with food_names as (
  select
    id,
    lower(concat_ws(' ', name_en, normalized_name, description, array_to_string(search_keywords, ' '))) as text
  from public.foods
  where is_active = true
    and publish_status = 'published'
    and coalesce(is_primary_variant, true) = true
), regional_matches as (
  select id, 'nordic_staples'::text as region_code
  from food_names
  where text ~ '(salmon|cod|herring|mackerel|trout|arctic char|rye|barley|oat|skyr|lingonberry|cloudberry|cranberry|rapeseed|canola|dill|beet|cabbage|potato|mushroom|pea|venison|reindeer)'
  union
  select id, 'north_american_staples'::text as region_code
  from food_names
  where text ~ '(turkey|corn|maize|maple|peanut butter|pecan|avocado|pumpkin|sweet potato|quinoa|black bean|pinto bean|kale|cranberry|blueberry|cheddar|ranch|oat|potato|salmon|beef|chicken)'
)
insert into public.food_region_memberships (food_id, region_code, source)
select id, region_code, 'curated_rule'
from regional_matches
on conflict (food_id, region_code) do update set source = excluded.source;
