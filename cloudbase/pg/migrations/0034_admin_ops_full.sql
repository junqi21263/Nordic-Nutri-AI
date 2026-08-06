-- Admin ops: metric events, durable deletion audit, content moderation flags,
-- and a generic rate-limit RPC for vision/quota enforcement.

create table if not exists public.ops_metric_events (
  id uuid primary key default gen_random_uuid(),
  metric text not null check (char_length(metric) between 1 and 80),
  value double precision not null default 1,
  meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ops_metric_events_metric_created_at_idx
on public.ops_metric_events (metric, created_at desc);

-- Durable deletion audit survives app_users cascade (no FK to app_users).
create table if not exists public.ops_account_deletion_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  client_request_id uuid not null,
  outcome text not null check (outcome in ('started', 'succeeded', 'failed')),
  error_code text check (error_code is null or char_length(error_code) between 1 and 80),
  created_at timestamptz not null default now()
);

create index if not exists ops_account_deletion_log_created_at_idx
on public.ops_account_deletion_log (created_at desc);

create table if not exists public.content_moderation_flags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,
  source text not null check (source in ('feedback', 'coach', 'nickname', 'export')),
  snippet text not null check (char_length(snippet) between 1 and 2000),
  matched_term text not null check (char_length(matched_term) between 1 and 120),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create index if not exists content_moderation_flags_status_created_at_idx
on public.content_moderation_flags (status, created_at desc);

create index if not exists content_moderation_flags_user_id_idx
on public.content_moderation_flags (user_id);

-- Generic sliding-window quota helper backed by private.rate_limit_windows.
-- window_started_at = floor(epoch / window_seconds) * window_seconds.
create or replace function public.consume_rate_limit_window(
  p_user_id uuid,
  p_operation text,
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
  if p_limit < 1 or p_limit > 10000 then
    raise exception 'rate limit quota is invalid';
  end if;
  if p_window_seconds < 1 or p_window_seconds > 86400 * 7 then
    raise exception 'rate limit window is invalid';
  end if;

  v_window_started_at := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into private.rate_limit_windows (user_id, operation, window_started_at, request_count)
  values (p_user_id, p_operation, v_window_started_at, 1)
  on conflict (user_id, operation, window_started_at) do update
    set request_count = private.rate_limit_windows.request_count + 1,
        updated_at = now()
    where private.rate_limit_windows.request_count < p_limit
  returning request_count into v_used_count;

  if found then
    return query select true, v_used_count;
    return;
  end if;

  select usage_window.request_count into v_used_count
  from private.rate_limit_windows usage_window
  where usage_window.user_id = p_user_id
    and usage_window.operation = p_operation
    and usage_window.window_started_at = v_window_started_at;

  return query select false, coalesce(v_used_count, p_limit);
end;
$$;

create or replace function public.get_rate_limit_window_usage(
  p_user_id uuid,
  p_operation text,
  p_window_seconds integer
)
returns table (used_count integer)
language sql
security definer
set search_path = private, public, pg_temp
as $$
  select coalesce((
    select usage_window.request_count
    from private.rate_limit_windows usage_window
    where usage_window.user_id = p_user_id
      and usage_window.operation = p_operation
      and usage_window.window_started_at = to_timestamp(
        floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
      )
  ), 0)::integer;
$$;

alter table public.ops_metric_events enable row level security;
alter table public.ops_account_deletion_log enable row level security;
alter table public.content_moderation_flags enable row level security;

revoke all on public.ops_metric_events, public.ops_account_deletion_log, public.content_moderation_flags from public, anon, authenticated;
revoke all on function public.consume_rate_limit_window(uuid, text, integer, integer) from public, anon, authenticated;
revoke all on function public.get_rate_limit_window_usage(uuid, text, integer) from public, anon, authenticated;

grant execute on function public.consume_rate_limit_window(uuid, text, integer, integer) to service_role;
grant execute on function public.get_rate_limit_window_usage(uuid, text, integer) to service_role;

create policy "ops metric events: server only"
on public.ops_metric_events for all to public using (false) with check (false);

create policy "ops account deletion log: server only"
on public.ops_account_deletion_log for all to public using (false) with check (false);

create policy "content moderation flags: server only"
on public.content_moderation_flags for all to public using (false) with check (false);
