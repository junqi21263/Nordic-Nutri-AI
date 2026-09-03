-- 0055: restore the fast-path vision quota contract used by get-login-ticket.
-- Forward-only and idempotent. This migration does not rewrite product data.

create table if not exists private.vision_quota_reservations (
  user_id uuid not null references public.app_users(id) on delete cascade,
  client_request_id uuid not null,
  reservation_id uuid not null default gen_random_uuid(),
  analysis_id uuid,
  state text not null default 'reserved'
    check (state in ('reserved', 'committed', 'released', 'expired')),
  reservation_state text not null default 'reserved'
    check (reservation_state in ('reserved', 'committed', 'released')),
  expires_at timestamptz not null,
  reservation_expires_at timestamptz not null,
  response jsonb,
  created_at timestamptz not null default now(),
  released_at timestamptz,
  primary key (user_id, client_request_id),
  unique (reservation_id)
);

create index if not exists vision_quota_reservations_expires_at_idx
  on private.vision_quota_reservations (expires_at)
  where state = 'reserved';

create unique index if not exists vision_quota_reservations_analysis_id_idx
  on private.vision_quota_reservations (analysis_id)
  where analysis_id is not null;

alter table private.vision_quota_reservations enable row level security;
alter table private.vision_quota_reservations force row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'private'
      and tablename = 'vision_quota_reservations'
      and policyname = 'vision quota reservations: server only'
  ) then
    create policy "vision quota reservations: server only"
      on private.vision_quota_reservations
      for all to public using (false) with check (false);
  end if;
end $$;

create or replace function public.reserve_vision_quota(
  p_user_id uuid,
  p_client_request_id uuid,
  p_daily_limit integer,
  p_daily_window_seconds integer,
  p_burst_limit integer,
  p_burst_window_seconds integer,
  p_ttl_seconds integer
)
returns table(
  allowed boolean,
  state text,
  reused boolean,
  response jsonb,
  daily_used integer,
  burst_used integer,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_existing private.vision_quota_reservations%rowtype;
  v_daily record;
  v_burst record;
  v_expires_at timestamptz := now() + make_interval(secs => p_ttl_seconds);
begin
  if p_user_id is null or p_client_request_id is null
     or p_daily_limit < 1 or p_daily_window_seconds < 1
     or p_burst_limit < 1 or p_burst_window_seconds < 1
     or p_ttl_seconds < 1 then
    raise exception 'vision quota parameters are invalid';
  end if;

  select * into v_existing
    from private.vision_quota_reservations
   where user_id = p_user_id and client_request_id = p_client_request_id
   for update;

  if found and v_existing.state = 'reserved' and v_existing.expires_at > now() then
    return query select true, v_existing.state, true, v_existing.response,
      (select used_count from public.get_rate_limit_window_usage(p_user_id, 'vision_analysis_daily', p_daily_window_seconds)),
      (select used_count from public.get_rate_limit_window_usage(p_user_id, 'vision_analysis_burst', p_burst_window_seconds)),
      v_existing.expires_at;
    return;
  end if;

  if found and v_existing.state = 'committed' then
    return query select true, v_existing.state, true, v_existing.response, 0, 0, v_existing.expires_at;
    return;
  end if;

  if found and v_existing.state = 'reserved' then
    update private.vision_quota_reservations
       set state = 'expired', reservation_state = 'released', released_at = coalesce(released_at, now())
     where user_id = p_user_id and client_request_id = p_client_request_id;
  end if;

  select * into v_daily from public.consume_rate_limit_window(
    p_user_id, 'vision_analysis_daily', p_daily_limit, p_daily_window_seconds
  );
  if not coalesce(v_daily.allowed, false) then
    return query select false, 'rate_limited'::text, false, null::jsonb,
      coalesce(v_daily.used_count, p_daily_limit), 0, null::timestamptz;
    return;
  end if;

  select * into v_burst from public.consume_rate_limit_window(
    p_user_id, 'vision_analysis_burst', p_burst_limit, p_burst_window_seconds
  );
  if not coalesce(v_burst.allowed, false) then
    return query select false, 'rate_limited'::text, false, null::jsonb,
      coalesce(v_daily.used_count, 0), coalesce(v_burst.used_count, p_burst_limit), null::timestamptz;
    return;
  end if;

  insert into private.vision_quota_reservations(
    user_id, client_request_id, state, reservation_state, expires_at, reservation_expires_at
  ) values (
    p_user_id, p_client_request_id, 'reserved', 'reserved', v_expires_at, v_expires_at
  )
  on conflict (user_id, client_request_id) do update
    set state = 'reserved', reservation_state = 'reserved', expires_at = excluded.expires_at,
        reservation_expires_at = excluded.reservation_expires_at, response = null, released_at = null;

  return query select true, 'reserved'::text, false, null::jsonb,
    v_daily.used_count, v_burst.used_count, v_expires_at;
end;
$$;

create or replace function public.commit_vision_quota(
  p_user_id uuid,
  p_client_request_id uuid,
  p_response jsonb default null
)
returns table(state text, response jsonb)
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  update private.vision_quota_reservations
     set state = 'committed', reservation_state = 'committed', response = coalesce(p_response, response)
   where user_id = p_user_id and client_request_id = p_client_request_id
     and state in ('reserved', 'committed');

  return query
  select q.state, q.response
    from private.vision_quota_reservations q
   where q.user_id = p_user_id and q.client_request_id = p_client_request_id;
end;
$$;

create or replace function public.release_vision_quota(
  p_user_id uuid,
  p_client_request_id uuid
)
returns table(state text)
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  update private.vision_quota_reservations
     set state = 'released', reservation_state = 'released', released_at = coalesce(released_at, now())
   where user_id = p_user_id and client_request_id = p_client_request_id
     and state = 'reserved';

  return query
  select q.state
    from private.vision_quota_reservations q
   where q.user_id = p_user_id and q.client_request_id = p_client_request_id;
end;
$$;

revoke all on private.vision_quota_reservations from public, anon, authenticated;
revoke all on function public.reserve_vision_quota(uuid,uuid,integer,integer,integer,integer,integer) from public, anon, authenticated;
revoke all on function public.commit_vision_quota(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.release_vision_quota(uuid,uuid) from public, anon, authenticated;
grant execute on function public.reserve_vision_quota(uuid,uuid,integer,integer,integer,integer,integer) to service_role;
grant execute on function public.commit_vision_quota(uuid,uuid,jsonb) to service_role;
grant execute on function public.release_vision_quota(uuid,uuid) to service_role;
