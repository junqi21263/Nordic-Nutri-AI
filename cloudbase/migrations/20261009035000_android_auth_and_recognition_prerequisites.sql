-- Production prerequisites for Android auth and recognition feedback.
-- Verification codes and feedback remain server-only through RLS and grants.

alter table public.app_users
  add column if not exists email text,
  add column if not exists email_normalized text,
  add column if not exists email_verified_at timestamptz,
  add column if not exists phone_e164 text,
  add column if not exists phone_verified_at timestamptz,
  add column if not exists password_hash text,
  add column if not exists google_sub text,
  add column if not exists created_platform text not null default 'wechat_mini_program',
  add column if not exists token_version integer not null default 1,
  add column if not exists password_changed_at timestamptz,
  add column if not exists registration_channel text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_users'::regclass
      and conname = 'app_users_created_platform_check'
  ) then
    alter table public.app_users add constraint app_users_created_platform_check
      check (created_platform in ('wechat_mini_program', 'android_app'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.app_users'::regclass
      and conname = 'app_users_token_version_check'
  ) then
    alter table public.app_users add constraint app_users_token_version_check
      check (token_version >= 1);
  end if;
end $$;

create unique index if not exists app_users_email_normalized_uidx
  on public.app_users (email_normalized)
  where email_normalized is not null;
create unique index if not exists app_users_phone_e164_uidx
  on public.app_users (phone_e164)
  where phone_e164 is not null;
create unique index if not exists app_users_google_sub_uidx
  on public.app_users (google_sub)
  where google_sub is not null;

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

alter table public.auth_verification_codes
  add column if not exists target_value text,
  add column if not exists status text not null default 'created',
  add column if not exists sent_at timestamptz,
  add column if not exists invalidated_at timestamptz,
  add column if not exists provider text,
  add column if not exists provider_message_id text,
  add column if not exists provider_delivery_status text,
  add column if not exists provider_http_status integer,
  add column if not exists provider_error_code text,
  add column if not exists provider_error_reason text,
  add column if not exists user_id uuid,
  add column if not exists trace_id text,
  add column if not exists send_attempt_count integer not null default 0,
  add column if not exists captcha_status text,
  add column if not exists rate_limit_status text;

alter table public.auth_verification_codes
  drop constraint if exists auth_verification_codes_target_type_check,
  drop constraint if exists auth_verification_codes_status_check;
alter table public.auth_verification_codes
  add constraint auth_verification_codes_target_type_check
    check (target_type in ('email', 'phone', 'captcha')),
  add constraint auth_verification_codes_status_check
    check (status in ('created', 'sent', 'failed', 'used', 'expired', 'invalidated'));

create index if not exists auth_verification_codes_live_lookup_idx
  on public.auth_verification_codes (target, target_type, purpose, created_at desc)
  where used_at is null;
create index if not exists auth_verification_codes_created_at_idx
  on public.auth_verification_codes (created_at desc);
create index if not exists auth_verification_codes_user_id_idx
  on public.auth_verification_codes (user_id, created_at desc)
  where user_id is not null;

alter table public.auth_verification_codes enable row level security;
revoke all on public.auth_verification_codes from public, anon, authenticated;
grant all on public.auth_verification_codes to service_role;

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
     and status in ('created', 'sent')
   order by created_at desc
   limit 1
   for update;

  if v_id is null or v_attempt_count >= 5 then
    return false;
  end if;

  if v_expires_at <= p_now then
    update public.auth_verification_codes set status = 'expired' where id = v_id;
    return false;
  end if;

  if v_code_hash <> p_code_hash then
    update public.auth_verification_codes
       set attempt_count = attempt_count + 1
     where id = v_id;
    return false;
  end if;

  update public.auth_verification_codes
     set used_at = p_now,
         status = 'used'
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

update public.app_users
   set registration_channel = case
     when google_sub is not null then 'google'
     when phone_e164 is not null then 'phone'
     when email_normalized is not null then 'email'
     else 'wechat'
   end
 where registration_channel is null;
alter table public.app_users
  alter column registration_channel set default 'wechat',
  alter column registration_channel set not null;
alter table public.app_users
  drop constraint if exists app_users_registration_channel_check;
alter table public.app_users
  add constraint app_users_registration_channel_check
    check (registration_channel in ('wechat', 'email', 'phone', 'google'));
create index if not exists app_users_registration_channel_created_at_idx
  on public.app_users (registration_channel, created_at desc);

create table if not exists public.recognition_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  meal_id uuid references public.meal_records(id) on delete set null,
  analysis_id uuid references public.ai_analysis(id) on delete set null,
  feedback_type text not null check (feedback_type in ('wrong_food', 'missing_food', 'extra_food', 'portion_inaccurate', 'nutrition_data', 'other')),
  original_result jsonb not null,
  corrected_result jsonb,
  model text,
  model_version text,
  image_sha256 char(64) check (image_sha256 is null or image_sha256 ~ '^[0-9a-fA-F]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists recognition_feedback_user_created_idx
  on public.recognition_feedback(user_id, created_at desc);
alter table public.recognition_feedback enable row level security;
drop policy if exists "recognition feedback: server only" on public.recognition_feedback;
create policy "recognition feedback: server only"
  on public.recognition_feedback
  for all to public
  using (false)
  with check (false);
revoke all on public.recognition_feedback from public, anon, authenticated;
grant all on public.recognition_feedback to service_role;
