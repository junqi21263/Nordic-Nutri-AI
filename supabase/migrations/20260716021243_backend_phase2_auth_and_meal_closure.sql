-- Phase 2: Auth identity bridge, safe default meal list, and atomic save.
alter table private.wechat_identities set schema public;
alter table public.wechat_identities enable row level security;
alter table public.wechat_identities alter column openid_ciphertext drop not null;
revoke all on table public.wechat_identities from anon, authenticated;

create table public.wechat_login_codes (
  code_hash char(64) primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references public.users(id) on delete cascade,
  used_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  check (expires_at > used_at)
);
alter table public.wechat_login_codes enable row level security;
revoke all on table public.wechat_login_codes from anon, authenticated;

alter table public.profiles add column last_login_at timestamptz;
alter table public.body_profiles add column birth_date date;
alter table public.body_profiles add constraint body_profiles_birth_date_check
  check (birth_date is null or birth_date between date '1900-01-01' and current_date);

create view public.active_meal_records with (security_invoker = true) as
  select * from public.meal_records where deleted_at is null;
grant select on public.active_meal_records to authenticated;

-- SECURITY INVOKER RPCs execute with the caller's role. RLS remains the
-- ownership boundary; table-level INSERT is required for SQL inside the RPC.
grant insert on public.meal_records, public.meal_items to authenticated;

create or replace function public.save_meal_atomic(p_input jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_meal_id uuid;
  v_item jsonb;
  v_result jsonb;
begin
  if v_user_id is null then raise exception 'UNAUTHORIZED'; end if;
  if jsonb_typeof(p_input->'items') <> 'array' or jsonb_array_length(p_input->'items') = 0 then
    raise exception 'VALIDATION_ERROR';
  end if;

  select id into v_meal_id from public.meal_records
  where user_id = v_user_id and client_request_id = (p_input->>'clientRequestId')::uuid;
  if v_meal_id is null then
    insert into public.meal_records (user_id, client_request_id, name, meal_type, recorded_at, plan_id, image_path, analysis_id, is_favorite)
    values (v_user_id, (p_input->>'clientRequestId')::uuid, p_input->>'name',
      coalesce(p_input->>'mealType', 'snack'), coalesce((p_input->>'recordedAt')::timestamptz, now()),
      nullif(p_input->>'planId','')::uuid, nullif(p_input->>'imagePath',''), nullif(p_input->>'analysisId','')::uuid,
      coalesce((p_input->>'isFavorite')::boolean, false)) returning id into v_meal_id;

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
grant execute on function public.save_meal_atomic(jsonb) to authenticated;
