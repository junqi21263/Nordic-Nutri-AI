-- Reconcile: production missed the original ai_model_quota_policies migration.
-- This additive copy is intentionally versioned after the current production
-- migration history so it can be applied without includeAll.

create table if not exists public.ai_model_quota_policies (
  provider_key text not null check (char_length(trim(provider_key)) between 1 and 64),
  model_key text not null check (char_length(trim(model_key)) between 1 and 255),
  feature_key text not null check (char_length(trim(feature_key)) between 1 and 64),
  daily_request_limit integer check (daily_request_limit is null or daily_request_limit between 1 and 10000000),
  alert_threshold_percent smallint not null default 80 check (alert_threshold_percent between 1 and 100),
  enabled boolean not null default true,
  provider_balance_mode text not null default 'unsupported'
    check (provider_balance_mode in ('unsupported', 'manual', 'automatic')),
  provider_balance_manual numeric(16, 4) check (provider_balance_manual is null or provider_balance_manual >= 0),
  provider_balance_unit text check (provider_balance_unit is null or char_length(trim(provider_balance_unit)) between 1 and 32),
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider_key, model_key, feature_key)
);

create table if not exists private.ai_model_quota_windows (
  provider_key text not null,
  model_key text not null,
  feature_key text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (provider_key, model_key, feature_key, window_started_at)
);

alter table public.ai_model_quota_policies enable row level security;
alter table public.ai_model_quota_policies force row level security;
alter table private.ai_model_quota_windows enable row level security;
alter table private.ai_model_quota_windows force row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public'
       and tablename = 'ai_model_quota_policies'
       and policyname = 'ai model quota policies: server only'
  ) then
    create policy "ai model quota policies: server only"
      on public.ai_model_quota_policies
      for all to public using (false) with check (false);
  end if;
  if not exists (
    select 1 from pg_policies
     where schemaname = 'private'
       and tablename = 'ai_model_quota_windows'
       and policyname = 'ai model quota windows: server only'
  ) then
    create policy "ai model quota windows: server only"
      on private.ai_model_quota_windows
      for all to public using (false) with check (false);
  end if;
end $$;

create or replace function public.consume_ai_model_quota(
  p_provider_key text,
  p_model_key text,
  p_feature_key text,
  p_daily_limit integer
)
returns table(
  allowed boolean,
  used_count integer,
  remaining integer,
  window_started_at timestamptz
)
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_window_started_at timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  v_used_count integer;
begin
  if coalesce(char_length(trim(p_provider_key)), 0) = 0
     or coalesce(char_length(trim(p_model_key)), 0) = 0
     or coalesce(char_length(trim(p_feature_key)), 0) = 0
     or p_daily_limit is null
     or p_daily_limit < 1 then
    raise exception 'model quota parameters are invalid';
  end if;

  insert into private.ai_model_quota_windows (
    provider_key, model_key, feature_key, window_started_at, request_count
  ) values (
    trim(p_provider_key), trim(p_model_key), trim(p_feature_key), v_window_started_at, 1
  )
  on conflict (provider_key, model_key, feature_key, window_started_at) do update
    set request_count = private.ai_model_quota_windows.request_count + 1,
        updated_at = now()
    where private.ai_model_quota_windows.request_count < p_daily_limit
  returning request_count into v_used_count;

  if found then
    return query select true, v_used_count, greatest(p_daily_limit - v_used_count, 0), v_window_started_at;
    return;
  end if;

  select q.request_count into v_used_count
    from private.ai_model_quota_windows as q
   where q.provider_key = trim(p_provider_key)
     and q.model_key = trim(p_model_key)
     and q.feature_key = trim(p_feature_key)
     and q.window_started_at = v_window_started_at;

  return query select false, coalesce(v_used_count, p_daily_limit), 0, v_window_started_at;
end;
$$;

create or replace function public.get_ai_model_quota_usage()
returns table(
  provider_key text,
  model_key text,
  feature_key text,
  used_count integer,
  window_started_at timestamptz
)
language sql
security definer
set search_path = private, public, pg_temp
as $$
  select q.provider_key, q.model_key, q.feature_key, q.request_count, q.window_started_at
    from private.ai_model_quota_windows as q
   where q.window_started_at = date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
$$;

revoke all on public.ai_model_quota_policies from public, anon, authenticated;
revoke all on private.ai_model_quota_windows from public, anon, authenticated;
revoke all on function public.consume_ai_model_quota(text, text, text, integer) from public, anon, authenticated;
revoke all on function public.get_ai_model_quota_usage() from public, anon, authenticated;
grant execute on function public.consume_ai_model_quota(text, text, text, integer) to service_role;
grant execute on function public.get_ai_model_quota_usage() to service_role;
