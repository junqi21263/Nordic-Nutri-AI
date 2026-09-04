-- Simplified Android Auth V1. Server-only auth state; never expose this table to clients.

alter table public.app_users
  add column if not exists email text,
  add column if not exists email_normalized text,
  add column if not exists email_verified_at timestamptz,
  add column if not exists password_hash text,
  add column if not exists created_platform text not null default 'wechat_mini_program',
  add column if not exists token_version integer not null default 1,
  add column if not exists password_changed_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'app_users_created_platform_check') then
    alter table public.app_users add constraint app_users_created_platform_check
      check (created_platform in ('wechat_mini_program', 'android_app'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'app_users_token_version_check') then
    alter table public.app_users add constraint app_users_token_version_check
      check (token_version >= 1);
  end if;
end $$;

create unique index if not exists app_users_email_normalized_uidx
  on public.app_users (email_normalized)
  where email_normalized is not null;

create table if not exists public.auth_verification_codes (
  id uuid primary key default gen_random_uuid(),
  target text not null,
  target_type text not null check (target_type in ('email', 'captcha')),
  purpose text not null check (purpose in ('register', 'reset_password', 'captcha')),
  code_hash char(64) not null check (code_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  attempt_count integer not null default 0 check (attempt_count >= 0 and attempt_count <= 5),
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists auth_verification_codes_live_lookup_idx
  on public.auth_verification_codes (target, target_type, purpose, created_at desc)
  where used_at is null;

alter table public.auth_verification_codes enable row level security;
revoke all on public.auth_verification_codes from public, anon, authenticated;

create or replace function public.consume_auth_verification_code(
  p_target text,
  p_target_type text,
  p_purpose text,
  p_code_hash text,
  p_now timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_code_hash char(64);
  v_attempt_count integer;
  v_expires_at timestamptz;
begin
  select id, code_hash, attempt_count, expires_at
    into v_id, v_code_hash, v_attempt_count, v_expires_at
    from public.auth_verification_codes
   where target = p_target
     and target_type = p_target_type
     and purpose = p_purpose
     and used_at is null
   order by created_at desc
   limit 1
   for update;

  if v_id is null or v_attempt_count >= 5 then
    return false;
  end if;

  if v_expires_at <= p_now then
    return false;
  end if;

  if v_code_hash <> p_code_hash then
    update public.auth_verification_codes
       set attempt_count = attempt_count + 1
     where id = v_id;
    return false;
  end if;

  update public.auth_verification_codes
     set used_at = p_now
   where id = v_id;
  return true;
end;
$$;

revoke all on function public.consume_auth_verification_code(text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.consume_auth_verification_code(text, text, text, text, timestamptz)
  to service_role;

create or replace function public.update_app_user_password(
  p_user_id uuid,
  p_password_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.app_users
     set password_hash = p_password_hash,
         token_version = token_version + 1,
         password_changed_at = now(),
         updated_at = now()
   where id = p_user_id
     and status = 'active';
  return found;
end;
$$;

revoke all on function public.update_app_user_password(uuid, text)
  from public, anon, authenticated;
grant execute on function public.update_app_user_password(uuid, text)
  to service_role;

-- Rollback (manual, only before dependent application code is released):
-- drop function if exists public.update_app_user_password(uuid, text);
-- drop function if exists public.consume_auth_verification_code(text, text, text, text, timestamptz);
-- drop table if exists public.auth_verification_codes;
-- drop index if exists public.app_users_email_normalized_uidx;
-- alter table public.app_users drop constraint if exists app_users_created_platform_check;
-- alter table public.app_users drop constraint if exists app_users_token_version_check;
-- alter table public.app_users drop column if exists password_changed_at;
-- alter table public.app_users drop column if exists token_version;
-- alter table public.app_users drop column if exists created_platform;
-- alter table public.app_users drop column if exists password_hash;
-- alter table public.app_users drop column if exists email_verified_at;
-- alter table public.app_users drop column if exists email_normalized;
-- alter table public.app_users drop column if exists email;
