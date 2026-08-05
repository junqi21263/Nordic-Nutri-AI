-- Coach chat is cost-bearing. This RPC is the single atomic boundary before a
-- request can reach the model provider. The calendar day is always China
-- Standard Time and is calculated by PostgreSQL, never from client input.

create or replace function public.get_coach_daily_message_usage(
  p_user_id uuid
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
      and usage_window.operation = 'coach_daily_message'
      and usage_window.window_started_at = (date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai')
  ), 0)::integer;
$$;

create or replace function public.consume_coach_daily_message(
  p_user_id uuid,
  p_limit integer default 20
)
returns table (allowed boolean, used_count integer)
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_window_started_at timestamptz := date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai';
  v_used_count integer;
begin
  if p_limit < 1 or p_limit > 100 then
    raise exception 'coach daily message limit is invalid';
  end if;

  insert into private.rate_limit_windows (user_id, operation, window_started_at, request_count)
  values (p_user_id, 'coach_daily_message', v_window_started_at, 1)
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
    and usage_window.operation = 'coach_daily_message'
    and usage_window.window_started_at = v_window_started_at;
  return query select false, coalesce(v_used_count, p_limit);
end;
$$;

revoke all on function public.get_coach_daily_message_usage(uuid) from public, anon, authenticated;
revoke all on function public.consume_coach_daily_message(uuid, integer) from public, anon, authenticated;
grant execute on function public.get_coach_daily_message_usage(uuid) to service_role;
grant execute on function public.consume_coach_daily_message(uuid, integer) to service_role;
