-- The OUT parameter window_started_at also conflicts with identifiers in an
-- ON CONFLICT column list. Refer to the primary-key constraint explicitly.
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
  on conflict on constraint ai_feature_user_quota_windows_pkey do update
    set request_count = private.ai_feature_user_quota_windows.request_count + 1, updated_at = now()
    where private.ai_feature_user_quota_windows.request_count < p_daily_limit
  returning request_count into v_used_count;
  if found then
    return query select true as allowed, v_used_count as used_count,
      greatest(p_daily_limit - v_used_count, 0) as remaining,
      v_window_started_at as window_started_at;
    return;
  end if;
  select q.request_count into v_used_count
    from private.ai_feature_user_quota_windows q
   where q.user_id = p_user_id
     and q.feature_key = trim(p_feature_key)
     and q.window_started_at = v_window_started_at;
  return query select false as allowed,
    coalesce(v_used_count, p_daily_limit) as used_count,
    0 as remaining, v_window_started_at as window_started_at;
end;
$$;
