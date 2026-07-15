begin;

insert into auth.users (
  id,
  aud,
  role,
  email,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated', 'rls-user-a@example.test', '{}'::jsonb, '{}'::jsonb, now(), now()),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated', 'rls-user-b@example.test', '{}'::jsonb, '{}'::jsonb, now(), now());

update public.profiles
set nickname = case id
  when '11111111-1111-1111-1111-111111111111' then 'RLS User A'
  when '22222222-2222-2222-2222-222222222222' then 'RLS User B'
end
where id in (
  '11111111-1111-1111-1111-111111111111',
  '22222222-2222-2222-2222-222222222222'
);

insert into public.user_goals (id, user_id, goal_type) values
  ('10000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'muscle_gain'),
  ('20000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'fat_loss');

insert into public.body_profiles (id, user_id, age, sex, height_cm, weight_kg) values
  ('10000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 30, 'undisclosed', 175, 70),
  ('20000000-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 28, 'undisclosed', 165, 60);

insert into public.nutrition_plans (
  id, user_id, goal_id, body_profile_id, daily_calories_kcal, protein_g, carbs_g, fat_g
) values
  ('10000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 2500, 160, 300, 70),
  ('20000000-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 1800, 120, 180, 60);

insert into public.meal_records (
  id, user_id, plan_id, name, calories_kcal, protein_g, carbs_g, fat_g
) values
  ('10000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '10000000-0000-0000-0000-000000000003', 'RLS Meal A', 500, 40, 50, 15),
  ('20000000-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', '20000000-0000-0000-0000-000000000003', 'RLS Meal B', 400, 30, 45, 12);

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);

do $$
declare
  visible_profile_count integer;
  visible_goal_count integer;
  visible_body_profile_count integer;
  visible_plan_count integer;
  visible_meal_count integer;
begin
  select count(*) into visible_profile_count from public.profiles;
  if visible_profile_count <> 1 then
    raise exception 'expected exactly one visible profile, got %', visible_profile_count;
  end if;

  select count(*) into visible_goal_count from public.user_goals;
  if visible_goal_count <> 1 then
    raise exception 'expected exactly one visible goal, got %', visible_goal_count;
  end if;

  select count(*) into visible_body_profile_count from public.body_profiles;
  if visible_body_profile_count <> 1 then
    raise exception 'expected exactly one visible body profile, got %', visible_body_profile_count;
  end if;

  select count(*) into visible_plan_count from public.nutrition_plans;
  if visible_plan_count <> 1 then
    raise exception 'expected exactly one visible nutrition plan, got %', visible_plan_count;
  end if;

  select count(*) into visible_meal_count from public.meal_records;
  if visible_meal_count <> 1 then
    raise exception 'expected exactly one visible meal record, got %', visible_meal_count;
  end if;
end;
$$;

rollback;
