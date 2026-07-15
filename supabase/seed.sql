-- Local development seed data only. No user, OpenID, meal, or AI data is seeded.

insert into public.food_catalog (
  canonical_name,
  aliases,
  serving_unit,
  calories_per_100g,
  protein_g_per_100g,
  carbs_g_per_100g,
  fat_g_per_100g,
  source,
  is_active
)
values
  ('鸡胸肉', array['chicken breast', 'chicken'], 'g', 165.00, 31.00, 0.00, 3.60, 'local_seed_v1', true),
  ('白米饭', array['rice', 'cooked white rice'], 'g', 130.00, 2.40, 28.20, 0.30, 'local_seed_v1', true),
  ('燕麦片', array['oats', 'oatmeal'], 'g', 389.00, 16.90, 66.30, 6.90, 'local_seed_v1', true),
  ('希腊酸奶', array['greek yogurt', 'yogurt'], 'g', 97.00, 9.00, 3.90, 5.00, 'local_seed_v1', true),
  ('全鸡蛋', array['egg', 'whole egg'], 'g', 143.00, 12.60, 0.70, 9.50, 'local_seed_v1', true)
on conflict do nothing;
