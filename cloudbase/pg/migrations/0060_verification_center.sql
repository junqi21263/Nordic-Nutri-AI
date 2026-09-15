-- Verification Center V1. Server-only operational metadata.
-- OTP plaintext and captcha answers are intentionally not stored here.

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

create index if not exists auth_verification_codes_created_at_idx
  on public.auth_verification_codes (created_at desc);

create index if not exists auth_verification_codes_user_id_idx
  on public.auth_verification_codes (user_id, created_at desc)
  where user_id is not null;

-- Keep all access server-only. The existing RLS policy/revokes remain in force.
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
