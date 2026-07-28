-- Merge common English display aliases into the Chinese public food groups.
-- Source rows are moved, never deleted; the alias group is retained inactive
-- for auditability.
with aliases(alias_key, canonical_key) as (
  values
    ('beef', '牛肉'), ('chicken', '鸡肉'), ('pork', '猪肉'),
    ('turkey', '火鸡肉'), ('duck', '鸭肉'), ('lamb', '羊肉'),
    ('salmon', '三文鱼'), ('tuna', '金枪鱼'), ('shrimp', '虾'),
    ('prawn', '虾'), ('crab', '螃蟹'), ('egg', '鸡蛋'),
    ('milk', '牛奶'), ('yogurt', '酸奶'), ('yoghurt', '酸奶'),
    ('cheese', '奶酪'), ('tofu', '豆腐'), ('rice', '米饭'),
    ('oat', '燕麦'), ('bread', '面包'), ('pasta', '意面'),
    ('potato', '土豆'), ('apple', '苹果'), ('banana', '香蕉'),
    ('orange', '橙子'), ('tomato', '番茄'), ('mushroom', '蘑菇'),
    ('avocado', '牛油果')
), pairs as (
  select alias_group.id as alias_id, canonical_group.id as canonical_id
  from aliases
  join public.food_groups alias_group on alias_group.normalized_key = aliases.alias_key
  join public.food_groups canonical_group on canonical_group.normalized_key = aliases.canonical_key
  where alias_group.id <> canonical_group.id
    and canonical_group.is_active = true
)
update public.foods food
set food_group_id = pairs.canonical_id, updated_at = now()
from pairs
where food.food_group_id = pairs.alias_id;

with aliases(alias_key, canonical_key) as (
  values
    ('beef', '牛肉'), ('chicken', '鸡肉'), ('pork', '猪肉'),
    ('turkey', '火鸡肉'), ('duck', '鸭肉'), ('lamb', '羊肉'),
    ('salmon', '三文鱼'), ('tuna', '金枪鱼'), ('shrimp', '虾'),
    ('prawn', '虾'), ('crab', '螃蟹'), ('egg', '鸡蛋'),
    ('milk', '牛奶'), ('yogurt', '酸奶'), ('yoghurt', '酸奶'),
    ('cheese', '奶酪'), ('tofu', '豆腐'), ('rice', '米饭'),
    ('oat', '燕麦'), ('bread', '面包'), ('pasta', '意面'),
    ('potato', '土豆'), ('apple', '苹果'), ('banana', '香蕉'),
    ('orange', '橙子'), ('tomato', '番茄'), ('mushroom', '蘑菇'),
    ('avocado', '牛油果')
), affected as (
  select canonical_group.id
  from aliases
  join public.food_groups canonical_group on canonical_group.normalized_key = aliases.canonical_key
), ranked as (
  select
    food.id,
    row_number() over (
      partition by food.food_group_id
      order by
        (food.name_zh is not null) desc,
        food.is_verified desc,
        food.is_featured desc,
        (food.brand_name is null) desc,
        food.quality_score desc,
        food.image_quality_score desc nulls last,
        food.popularity_score desc,
        food.id
    ) as position
  from public.foods food
  join affected on affected.id = food.food_group_id
  where food.is_active = true and food.publish_status = 'published'
)
update public.foods food
set
  is_primary_variant = ranked.position = 1,
  variant_label_zh = case
    when ranked.position = 1 then null
    else coalesce(nullif(btrim(food.food_form), ''), nullif(btrim(food.default_cooking_method), ''), nullif(btrim(food.brand_name), ''), nullif(btrim(food.name_en), ''), '其他营养版本')
  end,
  updated_at = now()
from ranked
where food.id = ranked.id;

with aliases(alias_key, canonical_key) as (
  values
    ('beef', '牛肉'), ('chicken', '鸡肉'), ('pork', '猪肉'),
    ('turkey', '火鸡肉'), ('duck', '鸭肉'), ('lamb', '羊肉'),
    ('salmon', '三文鱼'), ('tuna', '金枪鱼'), ('shrimp', '虾'),
    ('prawn', '虾'), ('crab', '螃蟹'), ('egg', '鸡蛋'),
    ('milk', '牛奶'), ('yogurt', '酸奶'), ('yoghurt', '酸奶'),
    ('cheese', '奶酪'), ('tofu', '豆腐'), ('rice', '米饭'),
    ('oat', '燕麦'), ('bread', '面包'), ('pasta', '意面'),
    ('potato', '土豆'), ('apple', '苹果'), ('banana', '香蕉'),
    ('orange', '橙子'), ('tomato', '番茄'), ('mushroom', '蘑菇'),
    ('avocado', '牛油果')
), pairs as (
  select alias_group.id as alias_id, canonical_group.id as canonical_id
  from aliases
  join public.food_groups alias_group on alias_group.normalized_key = aliases.alias_key
  join public.food_groups canonical_group on canonical_group.normalized_key = aliases.canonical_key
  where alias_group.id <> canonical_group.id
)
update public.food_groups alias_group
set is_active = false, primary_food_id = null, updated_at = now()
from pairs
where alias_group.id = pairs.alias_id;

update public.food_groups groups
set
  primary_food_id = food.id,
  category_id = food.category_id,
  canonical_name_zh = coalesce(nullif(btrim(food.name_zh), ''), groups.canonical_name_zh),
  canonical_name_en = coalesce(nullif(btrim(food.name_en), ''), groups.canonical_name_en),
  updated_at = now()
from public.foods food
where food.food_group_id = groups.id and food.is_primary_variant = true;

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
