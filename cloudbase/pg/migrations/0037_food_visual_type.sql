-- Optional manual override for the Food Image Prompt Engine.
-- NULL preserves legacy data and means: resolve automatically from tags/name/category.
alter table public.foods
  add column if not exists visual_type text;

alter table public.foods
  drop constraint if exists foods_visual_type_check;

alter table public.foods
  add constraint foods_visual_type_check
  check (visual_type is null or visual_type in (
    'raw_meat','processed_meat','whole_fish','fish_fillet','shellfish','egg',
    'dairy_liquid','dairy_solid','tofu_soy','grain','flour_powder','bread_baked',
    'root_tuber','leafy_vegetable','whole_vegetable','whole_fruit','cut_fruit',
    'nuts_seeds','oil_liquid','condiment_liquid','sauce_paste','dry_spice',
    'beverage_liquid','drink_powder','coffee_powder','tea_leaf','alcohol_bottle',
    'non_alcohol_wine','canned_food','packaged_snack','prepared_dish','unknown'
  ));

comment on column public.foods.visual_type is
  'Optional manual Food Image Prompt Engine visual type override; NULL resolves automatically.';
