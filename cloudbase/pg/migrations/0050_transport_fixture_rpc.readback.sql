select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_functiondef(p.oid) like '%transport-smoke-%' as transport_marker,
       pg_get_functiondef(p.oid) like '%quota_state = ''none''%' as no_quota_guard
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'find_active_transport_fixtures',
    'create_transport_fixture',
    'cleanup_transport_fixture'
  )
order by p.proname;
