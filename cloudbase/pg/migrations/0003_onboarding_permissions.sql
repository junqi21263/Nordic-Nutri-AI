-- CloudBase PG RLS for the account and first-registration path.

create or replace function private.current_app_user_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select app_user.id
  from public.app_users as app_user
  where app_user.cloudbase_uid = auth.uid()::text
$$;

revoke all on schema private from public, anon, authenticated;
revoke all on function private.current_app_user_id() from public, anon, authenticated;
revoke all on function public.bootstrap_current_user() from public, anon;
grant execute on function public.bootstrap_current_user() to authenticated;

grant usage on schema public to authenticated;
grant select on public.app_users, public.profiles, public.user_settings, public.user_goals, public.body_profiles to authenticated;
grant update (nickname, avatar_path, timezone, onboarding_completed_at) on public.profiles to authenticated;
grant update (dietary_pattern, food_avoidances, meals_per_day, theme, locale, unit_system, notification_enabled, developer_mode) on public.user_settings to authenticated;
grant insert, update, delete on public.user_goals, public.body_profiles to authenticated;

alter table public.app_users enable row level security;
alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.user_goals enable row level security;
alter table public.body_profiles enable row level security;

create policy "app users: read own row"
on public.app_users for select to authenticated
using (id = private.current_app_user_id());

create policy "profiles: read own profile"
on public.profiles for select to authenticated
using (id = private.current_app_user_id());

create policy "profiles: update own profile"
on public.profiles for update to authenticated
using (id = private.current_app_user_id())
with check (id = private.current_app_user_id());

create policy "settings: read own settings"
on public.user_settings for select to authenticated
using (id = private.current_app_user_id());

create policy "settings: update own settings"
on public.user_settings for update to authenticated
using (id = private.current_app_user_id())
with check (id = private.current_app_user_id());

create policy "goals: read own rows"
on public.user_goals for select to authenticated
using (user_id = private.current_app_user_id());

create policy "goals: insert own rows"
on public.user_goals for insert to authenticated
with check (user_id = private.current_app_user_id());

create policy "goals: update own rows"
on public.user_goals for update to authenticated
using (user_id = private.current_app_user_id())
with check (user_id = private.current_app_user_id());

create policy "goals: delete own rows"
on public.user_goals for delete to authenticated
using (user_id = private.current_app_user_id());

create policy "body profiles: read own rows"
on public.body_profiles for select to authenticated
using (user_id = private.current_app_user_id());

create policy "body profiles: insert own rows"
on public.body_profiles for insert to authenticated
with check (user_id = private.current_app_user_id());

create policy "body profiles: update own rows"
on public.body_profiles for update to authenticated
using (user_id = private.current_app_user_id())
with check (user_id = private.current_app_user_id());

create policy "body profiles: delete own rows"
on public.body_profiles for delete to authenticated
using (user_id = private.current_app_user_id());
