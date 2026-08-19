select
  exists (
    select 1
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname = 'release_expired_vision_quota_reservations'
       and pg_get_functiondef(p.oid) like '%reservation_state = ''released''%'
       and pg_get_functiondef(p.oid) like '%quota_state = ''released''%'
  ) as expiry_function_reconciled,
  (
    select count(*)
      from private.vision_quota_reservations q
     where q.state = 'expired'
       and q.reservation_state = 'reserved'
       and q.expires_at <= now()
  ) as stale_expired_reservations,
  (
    select count(*)
      from private.vision_quota_reservations q
      join public.ai_analysis a on a.id = q.analysis_id
     where q.state = 'expired'
       and q.reservation_state = 'released'
       and a.status in ('failed', 'timed_out', 'cancelled')
       and a.quota_state = 'reserved'
  ) as terminal_reserved_quota_rows;
