-- Bind an unused Android login method to the authenticated product user.
alter table public.app_users add column if not exists email_login_enabled boolean not null default false;
update public.app_users set email_login_enabled = true
  where email_normalized is not null and password_hash is not null and not email_login_enabled;

alter table public.auth_verification_codes
  drop constraint if exists auth_verification_codes_purpose_check;
alter table public.auth_verification_codes
  add constraint auth_verification_codes_purpose_check
    check (purpose in ('register', 'reset_password', 'captcha', 'bind'));

create or replace function public.bind_android_contact(
  p_user_id uuid,
  p_target text,
  p_target_hash text,
  p_target_type text,
  p_code_hash text,
  p_password_hash text default null,
  p_now timestamptz default now()
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user public.app_users%rowtype;
  v_code public.auth_verification_codes%rowtype;
begin
  if p_target_type not in ('email', 'phone') or p_target is null or p_target_hash !~ '^[0-9a-f]{64}$'
     or p_code_hash !~ '^[0-9a-f]{64}$' then
    return 'invalid';
  end if;

  select * into v_user from public.app_users
   where id = p_user_id and status = 'active' and created_platform = 'android_app'
   for update;
  if not found then return 'unauthorized'; end if;

  if (p_target_type = 'email' and v_user.email_normalized is not null and v_user.email_normalized <> p_target)
     or (p_target_type = 'phone' and v_user.phone_e164 is not null and v_user.phone_e164 <> p_target) then
    return 'already_bound';
  end if;
  if v_user.password_hash is null and (p_password_hash is null or length(p_password_hash) < 20) then
    return 'password_required';
  end if;

  select * into v_code from public.auth_verification_codes
   where target = p_target_hash and target_type = p_target_type and purpose = 'bind'
     and user_id = p_user_id and used_at is null and status in ('created', 'sent')
   order by created_at desc limit 1 for update;
  if not found or v_code.attempt_count >= 5 then return 'invalid_code'; end if;
  if v_code.expires_at <= p_now then
    update public.auth_verification_codes set status = 'expired' where id = v_code.id;
    return 'expired_code';
  end if;
  if v_code.status <> 'sent' or v_code.code_hash <> p_code_hash then
    update public.auth_verification_codes set attempt_count = attempt_count + 1 where id = v_code.id;
    return 'invalid_code';
  end if;

  begin
    if p_target_type = 'email' then
      update public.app_users set email = p_target, email_normalized = p_target,
        email_verified_at = p_now,
        email_login_enabled = true,
        password_hash = coalesce(password_hash, p_password_hash), updated_at = p_now
      where id = p_user_id;
    else
      update public.app_users set phone_e164 = p_target, phone_verified_at = p_now,
        password_hash = coalesce(password_hash, p_password_hash), updated_at = p_now
      where id = p_user_id;
    end if;
  exception when unique_violation then
    return 'occupied';
  end;

  update public.auth_verification_codes set used_at = p_now, status = 'used' where id = v_code.id;
  return 'bound';
end;
$$;

revoke all on function public.bind_android_contact(uuid, text, text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.bind_android_contact(uuid, text, text, text, text, text, timestamptz)
  to service_role;

create or replace function public.update_android_password_after_reset(
  p_user_id uuid,
  p_password_hash text,
  p_target_type text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_target_type not in ('email', 'phone') or p_password_hash is null then return false; end if;
  update public.app_users
     set password_hash = p_password_hash,
         email_login_enabled = case when p_target_type = 'email' then true else email_login_enabled end,
         token_version = token_version + 1,
         password_changed_at = now(), updated_at = now()
   where id = p_user_id and status = 'active' and created_platform = 'android_app';
  return found;
end;
$$;

revoke all on function public.update_android_password_after_reset(uuid, text, text) from public, anon, authenticated;
grant execute on function public.update_android_password_after_reset(uuid, text, text) to service_role;
