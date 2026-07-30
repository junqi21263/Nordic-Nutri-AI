-- Correct three verified whelk records whose nutrition category was incorrectly set to marine fish.
-- Their rows are preserved; only the category and image-facing presentation metadata are refined.
ALTER TABLE public.foods
  DROP CONSTRAINT IF EXISTS foods_visual_profile_key_check;

ALTER TABLE public.foods
  ADD CONSTRAINT foods_visual_profile_key_check
  CHECK (visual_profile_key IN ('standard', 'raw', 'cooked_plain', 'cooked_grilled', 'fresh', 'dry'));

WITH shellfish_category AS (
  SELECT id
  FROM public.food_categories
  WHERE code = 'seafood.shellfish'
)
UPDATE public.foods AS food
SET
  category_id = shellfish_category.id,
  visual_profile_key = CASE food.id
    WHEN '85b19747-cdda-4e86-9a27-4be914b1260e'::uuid THEN 'cooked_grilled'
    ELSE food.visual_profile_key
  END,
  default_cooking_method = CASE food.id
    WHEN 'ea1aa11b-a436-4366-9266-0ede83635dc4'::uuid THEN '清蒸'
    ELSE food.default_cooking_method
  END,
  image_subject_zh = CASE food.id
    WHEN '13cca128-f966-420a-97f2-326dc280c214'::uuid THEN '完整螺旋壳的生鲜海螺，壳口与自然湿润质地清楚可见'
    WHEN '85b19747-cdda-4e86-9a27-4be914b1260e'::uuid THEN '壳口打开的轻烤熟海螺，熟螺肉完整露出，肉质不透明且表面自然微焦'
    WHEN 'ea1aa11b-a436-4366-9266-0ede83635dc4'::uuid THEN '壳口打开的清蒸熟海螺，熟螺肉完整露出，肉质不透明且略微收缩'
    ELSE food.image_subject_zh
  END,
  updated_at = now()
FROM shellfish_category
WHERE food.id IN (
  '85b19747-cdda-4e86-9a27-4be914b1260e'::uuid,
  '13cca128-f966-420a-97f2-326dc280c214'::uuid,
  'ea1aa11b-a436-4366-9266-0ede83635dc4'::uuid
);
