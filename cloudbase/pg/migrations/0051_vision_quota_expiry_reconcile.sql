-- 0051: keep expired quota reservations and linked analyses terminally consistent.
-- Forward-only: do not restore an expired reservation to reserved.

create or replace function public.release_expired_vision_quota_reservations()
returns integer
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  released_count integer;
begin
  with expired as (
    update private.vision_quota_reservations
       set state = 'expired',
           reservation_state = 'released',
           released_at = coalesce(released_at, now())
     where state = 'reserved'
       and expires_at <= now()
    returning analysis_id
  ), synced as (
    update public.ai_analysis as a
       set quota_state = 'released',
           updated_at = now()
      from expired as e
     where a.id = e.analysis_id
       and a.quota_state = 'reserved'
    returning a.id
  )
  select count(*)::integer into released_count from synced;

  return coalesce(released_count, 0);
end;
$$;

-- Reconcile rows expired before this function was corrected. This is limited
-- to the known stale state and does not rewrite terminal analysis status.
with stale as (
  update private.vision_quota_reservations as q
     set reservation_state = 'released',
         released_at = coalesce(q.released_at, now())
   where q.state = 'expired'
     and q.reservation_state = 'reserved'
     and q.expires_at <= now()
   returning q.analysis_id
)
update public.ai_analysis as a
   set quota_state = 'released',
       updated_at = now()
  from stale as s
 where a.id = s.analysis_id
   and a.quota_state = 'reserved';

revoke all on function public.release_expired_vision_quota_reservations() from public;
