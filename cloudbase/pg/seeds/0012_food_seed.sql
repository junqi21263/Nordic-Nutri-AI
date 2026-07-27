-- Nordic Nutri AI high-frequency food seed.
-- Nutrition values are USDA FoodData Central reference values (per 100g),
-- marked as fixtures (is_verified = false, quality_score = 30) so operators
-- can re-sync from USDA after configuring USDA_API_KEY without conflict.
-- Re-running is idempotent via on conflict (source, source_id).

insert into public.foods (
  source, source_id, name_zh, name_en, normalized_name,
  category_id, serving_size, serving_unit,
  calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg,
  nutrition_basis, search_keywords, quality_score, is_verified, is_active
)
select
  'fixture' as source,
  v.slug as source_id,
  v.name_zh,
  v.name_en,
  lower(v.name_en) as normalized_name,
  c.id as category_id,
  100 as serving_size,
  'g' as serving_unit,
  v.calories,
  v.protein,
  v.carbs,
  v.fat,
  v.fiber,
  v.sugar,
  v.sodium,
  'per_100g' as nutrition_basis,
  string_to_array(lower(v.name_en || ' ' || v.name_zh), ' ') as search_keywords,
  30 as quality_score,
  false as is_verified,
  true as is_active
from (values
  ('chicken-breast','鸡胸肉','Chicken breast','meat',165,31.0,0.0,3.6,0.0,0.0,74.0),
  ('chicken-thigh','鸡腿肉','Chicken thigh (meat only)','meat',209,26.0,0.0,11.5,0.0,0.0,86.0),
  ('beef-lean','瘦牛肉','Beef, lean cooked','meat',217,26.1,0.0,11.8,0.0,0.0,56.0),
  ('pork-lean','瘦猪肉','Pork, lean cooked','meat',242,27.0,0.0,14.0,0.0,0.0,62.0),
  ('salmon','三文鱼','Salmon, Atlantic cooked','seafood',206,22.1,0.0,12.4,0.0,0.0,59.0),
  ('tuna','金枪鱼','Tuna, fresh cooked','seafood',184,30.0,0.0,6.3,0.0,0.0,47.0),
  ('shrimp','虾','Shrimp, cooked','seafood',99,24.0,0.2,0.3,0.0,0.0,111.0),
  ('cod','鳕鱼','Cod, Atlantic cooked','seafood',105,22.8,0.0,0.9,0.0,0.0,72.0),
  ('egg-whole','鸡蛋','Egg, whole cooked','egg',155,12.6,1.1,10.6,0.0,1.1,124.0),
  ('egg-white','蛋白','Egg white, raw','egg',52,10.9,0.7,0.2,0.0,0.0,166.0),
  ('milk-lowfat','低脂牛奶','Milk, low fat','dairy',50,3.4,5.0,1.9,0.0,5.0,44.0),
  ('milk-whole','全脂牛奶','Milk, whole','dairy',61,3.2,4.8,3.3,0.0,5.0,43.0),
  ('yogurt-plain','原味酸奶','Yogurt, plain','dairy',61,3.5,4.7,3.3,0.0,4.7,46.0),
  ('greek-yogurt','希腊酸奶','Greek yogurt, plain','dairy',97,9.0,3.9,5.0,0.0,3.9,35.0),
  ('cheese-mozzarella','马苏里拉奶酪','Mozzarella cheese','dairy',280,28.0,3.1,17.0,0.0,3.1,627.0),
  ('tofu-firm','北豆腐','Tofu, firm','soy',144,17.3,2.8,8.7,2.3,2.8,14.0),
  ('soymilk','豆浆','Soy milk','soy',33,2.9,1.7,1.8,0.6,1.7,53.0),
  ('edamame','毛豆','Edamame, cooked','soy',121,11.9,8.9,5.2,5.2,2.2,6.0),
  ('oats','燕麦','Oats, rolled dry','grain',379,13.2,67.7,6.5,10.1,0.0,6.0),
  ('oatmeal-cooked','燕麦粥','Oatmeal, cooked','grain',71,2.5,12.0,1.5,1.7,0.0,2.0),
  ('rice-white','白米饭','Rice, white cooked','grain',130,2.4,28.2,0.3,0.4,0.0,1.0),
  ('rice-brown','糙米饭','Rice, brown cooked','grain',123,2.7,25.6,1.0,1.6,0.0,5.0),
  ('whole-wheat-bread','全麦面包','Whole wheat bread','grain',247,13.0,41.0,4.2,6.0,5.0,472.0),
  ('pasta','意面','Pasta, cooked','grain',158,5.8,30.9,0.9,1.8,0.6,6.0),
  ('potato','土豆','Potato, baked','grain',93,2.5,21.2,0.1,2.2,1.0,10.0),
  ('sweet-potato','红薯','Sweet potato, baked','grain',90,2.0,20.7,0.1,3.0,4.2,36.0),
  ('broccoli','西兰花','Broccoli, cooked','vegetable',35,2.4,7.2,0.4,3.3,1.4,64.0),
  ('spinach','菠菜','Spinach, cooked','vegetable',23,3.0,3.8,0.3,2.4,0.4,115.0),
  ('tomato','番茄','Tomato, raw','vegetable',18,0.9,3.9,0.2,1.2,2.6,5.0),
  ('cucumber','黄瓜','Cucumber, raw','vegetable',15,0.7,3.6,0.1,0.5,1.7,2.0),
  ('carrot','胡萝卜','Carrot, raw','vegetable',41,0.9,9.6,0.2,2.8,4.7,69.0),
  ('bell-pepper','彩椒','Bell pepper, raw','vegetable',31,1.0,6.0,0.3,2.1,4.2,4.0),
  ('mushroom','蘑菇','Mushroom, raw','vegetable',22,3.1,3.3,0.3,1.0,2.0,5.0),
  ('banana','香蕉','Banana, raw','fruit',89,1.1,22.8,0.3,2.6,12.2,1.0),
  ('apple','苹果','Apple, with skin','fruit',52,0.3,13.8,0.2,2.4,10.4,1.0),
  ('blueberry','蓝莓','Blueberries, raw','fruit',57,0.5,14.5,0.3,2.4,9.7,1.0),
  ('avocado','牛油果','Avocado, raw','fruit',160,2.0,8.5,14.7,6.7,0.7,7.0),
  ('orange','橙子','Orange, raw','fruit',47,0.9,11.8,0.1,2.4,9.4,0.0),
  ('strawberry','草莓','Strawberries, raw','fruit',32,0.7,7.7,0.3,2.0,4.9,1.0),
  ('almonds','杏仁','Almonds, raw','other',579,21.2,21.6,49.9,12.5,4.4,1.0),
  ('peanut','花生','Peanuts, raw','other',567,25.8,16.1,49.2,8.5,4.7,18.0),
  ('walnut','核桃','Walnuts, raw','other',654,15.2,13.7,65.2,6.7,2.6,2.0),
  ('olive-oil','橄榄油','Olive oil','seasoning',884,0.0,0.0,100.0,0.0,0.0,2.0),
  ('honey','蜂蜜','Honey','seasoning',304,0.3,82.4,0.0,0.2,82.1,4.0),
  ('chickpeas','鹰嘴豆','Chickpeas, cooked','soy',164,8.9,27.4,2.6,7.6,4.8,7.0),
  ('lentils','扁豆','Lentils, cooked','soy',116,9.0,20.1,0.4,7.9,1.8,2.0),
  ('black-bean','黑豆','Black beans, cooked','soy',132,8.9,23.7,0.5,8.7,1.8,1.0),
  ('cottage-cheese','农家奶酪','Cottage cheese','dairy',98,11.1,3.4,4.3,0.0,2.6,308.0),
  ('tuna-canned','金枪鱼罐头','Tuna, canned in water','seafood',116,25.5,0.0,0.8,0.0,0.0,247.0),
  ('salmon-canned','三文鱼罐头','Salmon, canned','seafood',129,20.6,0.0,5.4,0.0,0.0,44.0),
  ('quinoa','藜麦','Quinoa, cooked','grain',120,4.4,21.3,1.9,2.8,0.9,7.0)
) as v(slug, name_zh, name_en, category_code, calories, protein, carbs, fat, fiber, sugar, sodium)
join public.food_categories c on c.code = v.category_code
where not exists (
  select 1 from public.foods f where f.source = 'fixture' and f.source_id = v.slug
)
on conflict (source, source_id) do nothing;
