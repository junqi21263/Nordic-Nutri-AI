-- 0056: qualify quota state columns in terminal RPCs.
-- The RETURNS TABLE(state ...) output column otherwise conflicts with q.state
-- in PL/pgSQL and causes SQLSTATE 42702 after vision persistence succeeds.

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
  update private.vision_quota_reservations as q
     set state = 'committed', reservation_state = 'committed', response = coalesce(p_response, q.response)
   where q.user_id = p_user_id and q.client_request_id = p_client_request_id
     and q.state in ('reserved', 'committed');

  return query
  select q.state, q.response
    from private.vision_quota_reservations as q
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
  update private.vision_quota_reservations as q
     set state = 'released', reservation_state = 'released', released_at = coalesce(q.released_at, now())
   where q.user_id = p_user_id and q.client_request_id = p_client_request_id
     and q.state = 'reserved';

  return query
  select q.state
    from private.vision_quota_reservations as q
   where q.user_id = p_user_id and q.client_request_id = p_client_request_id;
end;
$$;
