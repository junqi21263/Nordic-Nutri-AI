-- Ops helper: foods missing image_subject_zh (hard-case prompt anchors).
-- Prefer admin UI filter `missingImageSubject=true`, or run this in CloudBase SQL.

select
  f.id,
  f.name_zh,
  f.name_en,
  c.code as category_code,
  c.name_zh as category_name_zh,
  f.visual_profile_key,
  f.image_status
from public.foods f
left join public.food_categories c on c.id = f.category_id
where f.is_active = true
  and f.publish_status = 'published'
  and (f.image_subject_zh is null or btrim(f.image_subject_zh) = '')
order by c.code nulls last, f.name_zh
limit 500;
