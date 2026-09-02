-- Feature-level daily per-user quotas.  Null means unlimited and preserves
-- the existing behavior; counters are kept private and increment atomically.
create table if not exists public.ai_feature_user_quota_policies (
  feature_key text primary key check (char_length(trim(feature_key)) between 1 and 64),
  daily_request_limit integer check (daily_request_limit is null or daily_request_limit between 1 and 10000000),
  enabled boolean not null default true,
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists private.ai_feature_user_quota_windows (
  user_id uuid not null,
  feature_key text not null,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, feature_key, window_started_at)
);

alter table public.ai_feature_user_quota_policies enable row level security;
alter table public.ai_feature_user_quota_policies force row level security;
alter table private.ai_feature_user_quota_windows enable row level security;
alter table private.ai_feature_user_quota_windows force row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'ai_feature_user_quota_policies' and policyname = 'ai feature user quota policies: server only') then
    create policy "ai feature user quota policies: server only" on public.ai_feature_user_quota_policies for all to public using (false) with check (false);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'private' and tablename = 'ai_feature_user_quota_windows' and policyname = 'ai feature user quota windows: server only') then
    create policy "ai feature user quota windows: server only" on private.ai_feature_user_quota_windows for all to public using (false) with check (false);
  end if;
end $$;

create or replace function public.consume_ai_feature_user_quota(p_user_id uuid, p_feature_key text, p_daily_limit integer)
returns table(allowed boolean, used_count integer, remaining integer, window_started_at timestamptz)
language plpgsql security definer set search_path = private, public, pg_temp as $$
declare
  v_window_started_at timestamptz := date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
  v_used_count integer;
begin
  if p_user_id is null or coalesce(char_length(trim(p_feature_key)), 0) = 0 or p_daily_limit is null or p_daily_limit < 1 then
    raise exception 'feature user quota parameters are invalid';
  end if;
  insert into private.ai_feature_user_quota_windows(user_id, feature_key, window_started_at, request_count)
  values (p_user_id, trim(p_feature_key), v_window_started_at, 1)
  on conflict (user_id, feature_key, window_started_at) do update
    set request_count = private.ai_feature_user_quota_windows.request_count + 1, updated_at = now()
    where private.ai_feature_user_quota_windows.request_count < p_daily_limit
  returning request_count into v_used_count;
  if found then
    return query select true as allowed,
                        v_used_count as used_count,
                        greatest(p_daily_limit - v_used_count, 0) as remaining,
                        v_window_started_at as window_started_at;
    return;
  end if;
  select q.request_count into v_used_count from private.ai_feature_user_quota_windows q
   where q.user_id = p_user_id and q.feature_key = trim(p_feature_key) and q.window_started_at = v_window_started_at;
  return query select false as allowed,
                      coalesce(v_used_count, p_daily_limit) as used_count,
                      0 as remaining,
                      v_window_started_at as window_started_at;
end;
$$;

create or replace function public.get_ai_feature_user_quota_usage(p_user_id uuid)
returns table(feature_key text, used_count integer, window_started_at timestamptz)
language sql security definer set search_path = private, public, pg_temp as $$
  select q.feature_key, q.request_count, q.window_started_at
    from private.ai_feature_user_quota_windows q
   where q.user_id = p_user_id
     and q.window_started_at = date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
$$;

revoke all on public.ai_feature_user_quota_policies from public, anon, authenticated;
revoke all on private.ai_feature_user_quota_windows from public, anon, authenticated;
revoke all on function public.consume_ai_feature_user_quota(uuid, text, integer) from public, anon, authenticated;
revoke all on function public.get_ai_feature_user_quota_usage(uuid) from public, anon, authenticated;
grant execute on function public.consume_ai_feature_user_quota(uuid, text, integer) to service_role;
grant execute on function public.get_ai_feature_user_quota_usage(uuid) to service_role;
