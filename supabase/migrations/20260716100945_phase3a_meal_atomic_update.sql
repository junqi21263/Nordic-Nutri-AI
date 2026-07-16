-- Replace an owned active meal and all of its items in one transaction.
-- SECURITY INVOKER keeps the existing RLS ownership policies as the boundary.
create or replace function public.update_meal_atomic(p_input jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_meal_id uuid := (p_input->>'mealId')::uuid;
  v_item jsonb;
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'UNAUTHORIZED'; end if;
  if v_meal_id is null
    or jsonb_typeof(p_input->'items') <> 'array'
    or jsonb_array_length(p_input->'items') = 0 then
    raise exception 'VALIDATION_ERROR';
  end if;

  perform 1
  from public.meal_records
  where id = v_meal_id
    and user_id = v_user_id
    and deleted_at is null;
  if not found then raise exception 'NOT_FOUND'; end if;

  update public.meal_records
  set name = p_input->>'name',
      meal_type = p_input->>'mealType',
      recorded_at = (p_input->>'recordedAt')::timestamptz,
      is_favorite = coalesce((p_input->>'isFavorite')::boolean, false)
  where id = v_meal_id
    and user_id = v_user_id;

  delete from public.meal_items where meal_record_id = v_meal_id;

  for v_item in select value from jsonb_array_elements(p_input->'items') loop
    insert into public.meal_items (
      meal_record_id, food_id, name, ai_quantity_g, confirmed_quantity_g,
      calories_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g
    )
    values (
      v_meal_id,
      nullif(v_item->>'foodId', '')::uuid,
      v_item->>'name',
      nullif(v_item->>'aiQuantityG', '')::numeric,
      (v_item->>'confirmedQuantityG')::numeric,
      (v_item->>'caloriesPer100g')::numeric,
      (v_item->>'proteinGPer100g')::numeric,
      (v_item->>'carbsGPer100g')::numeric,
      (v_item->>'fatGPer100g')::numeric
    );
  end loop;

  select jsonb_build_object(
    'meal', to_jsonb(meal_record),
    'items', coalesce(jsonb_agg(to_jsonb(meal_item)), '[]'::jsonb)
  )
  into v_result
  from public.meal_records as meal_record
  left join public.meal_items as meal_item on meal_item.meal_record_id = meal_record.id
  where meal_record.id = v_meal_id
  group by meal_record.id;
  return v_result;
end;
$$;

grant execute on function public.update_meal_atomic(jsonb) to authenticated;
