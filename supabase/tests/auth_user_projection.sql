begin;

-- Auth users must receive the app-owned user and profile rows atomically.
-- Without this projection, normal onboarding and all user_id foreign keys fail.
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
values (
  '33333333-3333-3333-3333-333333333333',
  'authenticated',
  'authenticated',
  'auth-projection@example.test',
  '{}'::jsonb,
  '{}'::jsonb,
  now(),
  now()
);

do $$
begin
  if not exists (
    select 1
    from public.users
    where id = '33333333-3333-3333-3333-333333333333'
  ) then
    raise exception 'public.users projection was not created';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = '33333333-3333-3333-3333-333333333333'
  ) then
    raise exception 'public.profiles projection was not created';
  end if;
end;
$$;

rollback;
