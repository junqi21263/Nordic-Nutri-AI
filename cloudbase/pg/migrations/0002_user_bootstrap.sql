-- Creates or restores the application user attached to the authenticated
-- CloudBase identity. Historical bindings are inserted only by the private
-- migration process before the user signs in; the client never supplies one.

create or replace function public.bootstrap_current_user()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cloudbase_uid varchar(128) := auth.uid()::text;
  v_user_id uuid;
  v_onboarding_required boolean;
begin
  if v_cloudbase_uid is null or char_length(v_cloudbase_uid) = 0 then
    raise exception 'UNAUTHORIZED';
  end if;

  select app_user.id
  into v_user_id
  from public.app_users as app_user
  where app_user.cloudbase_uid = v_cloudbase_uid;

  if v_user_id is null then
    select migration.bound_user_id
    into v_user_id
    from private.identity_migrations as migration
    where migration.cloudbase_uid = v_cloudbase_uid
      and migration.bound_user_id is not null;
  end if;

  if v_user_id is null then
    insert into public.app_users (cloudbase_uid)
    values (v_cloudbase_uid)
    on conflict (cloudbase_uid) do update
      set updated_at = now()
    returning id into v_user_id;
  else
    update public.app_users
    set cloudbase_uid = v_cloudbase_uid,
        updated_at = now()
    where id = v_user_id;
  end if;

  insert into public.profiles (id, last_login_at)
  values (v_user_id, now())
  on conflict (id) do update
    set last_login_at = excluded.last_login_at;

  insert into public.user_settings (id)
  values (v_user_id)
  on conflict (id) do nothing;

  select profile.onboarding_completed_at is null
  into v_onboarding_required
  from public.profiles as profile
  where profile.id = v_user_id;

  return jsonb_build_object(
    'userId', v_user_id,
    'onboardingRequired', coalesce(v_onboarding_required, true)
  );
end;
$$;
