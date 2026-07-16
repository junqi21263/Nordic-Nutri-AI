comment on column public.wechat_identities.openid_hash is 'HMAC-SHA256("openid:" || openid, WECHAT_IDENTITY_PEPPER), never expose to clients';
comment on column public.wechat_login_codes.code_hash is 'HMAC-SHA256("code:" || code, WECHAT_IDENTITY_PEPPER), one-time replay guard';

-- These tables are private-by-permission despite living in public for the Data API.
-- Only the Edge Function's service role can perform its controlled lookup/insert bridge.
grant select, insert on table public.wechat_identities to service_role;
grant select, insert on table public.wechat_login_codes to service_role;

-- Keep the SECURITY INVOKER atomic meal save inside the caller's RLS scope,
-- and reject foreign plan, asset, or analysis references before insertion.
create or replace function public.save_meal_atomic(p_input jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_meal_id uuid;
  v_plan_id uuid := nullif(p_input->>'planId', '')::uuid;
  v_analysis_id uuid := nullif(p_input->>'analysisId', '')::uuid;
  v_image_path text := nullif(p_input->>'imagePath', '');
  v_item jsonb;
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'UNAUTHORIZED'; end if;
  if jsonb_typeof(p_input->'items') <> 'array' or jsonb_array_length(p_input->'items') = 0 then
    raise exception 'VALIDATION_ERROR';
  end if;

  if v_plan_id is not null and not exists (
    select 1 from public.nutrition_plans where id = v_plan_id and user_id = v_user_id
  ) then raise exception 'FORBIDDEN'; end if;
  if v_analysis_id is not null and not exists (
    select 1 from public.ai_analysis where id = v_analysis_id and user_id = v_user_id
  ) then raise exception 'FORBIDDEN'; end if;
  if v_image_path is not null and not exists (
    select 1 from public.uploaded_assets where object_path = v_image_path and user_id = v_user_id and status <> 'deleted'
  ) then raise exception 'FORBIDDEN'; end if;

  select id into v_meal_id from public.meal_records
  where user_id = v_user_id and client_request_id = (p_input->>'clientRequestId')::uuid;
  if v_meal_id is null then
    insert into public.meal_records (user_id, client_request_id, name, meal_type, recorded_at, plan_id, image_path, analysis_id, is_favorite)
    values (v_user_id, (p_input->>'clientRequestId')::uuid, p_input->>'name',
      coalesce(p_input->>'mealType', 'snack'), coalesce((p_input->>'recordedAt')::timestamptz, now()),
      v_plan_id, v_image_path, v_analysis_id, coalesce((p_input->>'isFavorite')::boolean, false)) returning id into v_meal_id;

    for v_item in select value from jsonb_array_elements(p_input->'items') loop
      insert into public.meal_items (meal_record_id, food_id, name, ai_quantity_g, confirmed_quantity_g,
        calories_per_100g, protein_g_per_100g, carbs_g_per_100g, fat_g_per_100g)
      values (v_meal_id, nullif(v_item->>'foodId','')::uuid, v_item->>'name',
        nullif(v_item->>'aiQuantityG','')::numeric, (v_item->>'confirmedQuantityG')::numeric,
        (v_item->>'caloriesPer100g')::numeric, (v_item->>'proteinGPer100g')::numeric,
        (v_item->>'carbsGPer100g')::numeric, (v_item->>'fatGPer100g')::numeric);
    end loop;
  end if;
  select jsonb_build_object('meal', to_jsonb(m), 'items', coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb))
  into v_result from public.meal_records m left join public.meal_items i on i.meal_record_id = m.id
  where m.id = v_meal_id group by m.id;
  return v_result;
end;
$$;
