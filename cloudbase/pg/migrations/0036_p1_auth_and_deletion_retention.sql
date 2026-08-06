-- P1 remediation: durable cross-instance admin login quota and bounded deletion audit retention.

create table if not exists private.admin_login_attempts (
  attempt_key text primary key check (attempt_key ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now()
);

create index if not exists admin_login_attempts_updated_at_idx
on private.admin_login_attempts (updated_at);

create or replace function public.consume_admin_login_attempt(
  p_attempt_key text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, used_count integer)
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_window_started_at timestamptz;
  v_used_count integer;
begin
  if p_attempt_key !~ '^[a-f0-9]{64}$' then
    raise exception 'admin login attempt key is invalid';
  end if;
  if p_limit < 1 or p_limit > 20 then
    raise exception 'admin login limit is invalid';
  end if;
  if p_window_seconds < 60 or p_window_seconds > 86400 then
    raise exception 'admin login window is invalid';
  end if;

  v_window_started_at := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into private.admin_login_attempts (attempt_key, window_started_at, request_count, updated_at)
  values (p_attempt_key, v_window_started_at, 1, now())
  on conflict (attempt_key) do update
    set window_started_at = case
          when private.admin_login_attempts.window_started_at = excluded.window_started_at
            then private.admin_login_attempts.window_started_at
          else excluded.window_started_at
        end,
        request_count = case
          when private.admin_login_attempts.window_started_at = excluded.window_started_at
            then private.admin_login_attempts.request_count + 1
          else 1
        end,
        updated_at = now()
    where private.admin_login_attempts.window_started_at <> excluded.window_started_at
       or private.admin_login_attempts.request_count < p_limit
  returning request_count into v_used_count;

  if found then
    return query select true, v_used_count;
    return;
  end if;

  select request_count into v_used_count
  from private.admin_login_attempts
  where attempt_key = p_attempt_key;
  return query select false, coalesce(v_used_count, p_limit);
end;
$$;

create or replace function public.clear_admin_login_attempt(p_attempt_key text)
returns void
language sql
security definer
set search_path = private, public, pg_temp
as $$
  delete from private.admin_login_attempts where attempt_key = p_attempt_key;
$$;

alter table private.admin_login_attempts enable row level security;
revoke all on private.admin_login_attempts from public, anon, authenticated;
revoke all on function public.consume_admin_login_attempt(text, integer, integer) from public, anon, authenticated;
revoke all on function public.clear_admin_login_attempt(text) from public, anon, authenticated;
grant execute on function public.consume_admin_login_attempt(text, integer, integer) to service_role;
grant execute on function public.clear_admin_login_attempt(text) to service_role;

alter table public.ops_account_deletion_log
  add column if not exists expires_at timestamptz;

update public.ops_account_deletion_log
set expires_at = created_at + interval '30 days'
where expires_at is null;

alter table public.ops_account_deletion_log
  alter column expires_at set default (now() + interval '30 days'),
  alter column expires_at set not null;

create index if not exists ops_account_deletion_log_expires_at_idx
on public.ops_account_deletion_log (expires_at);
