select table_schema, table_name, column_name
from information_schema.columns
where (table_schema, table_name, column_name) in (
  ('public','ai_analysis','version'),
  ('public','ai_analysis','provider_checkpoint'),
  ('public','uploaded_assets','analysis_id'),
  ('private','vision_quota_reservations','analysis_id'),
  ('private','vision_quota_reservations','reservation_expires_at')
)
order by table_schema, table_name, column_name;

select p.proname, pg_get_function_identity_arguments(p.oid) as arguments,
       pg_get_functiondef(p.oid) like '%a.version%' as qualified_version,
       pg_get_functiondef(p.oid) like '%version = version + 1%' as ambiguous_version
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('queue_vision_analysis','checkpoint_vision_analysis','complete_vision_analysis','fail_vision_analysis')
order by p.proname;

select indexname, indexdef
from pg_indexes
where (schemaname='public' and tablename in ('ai_analysis','uploaded_assets'))
   or (schemaname='private' and tablename='vision_quota_reservations')
order by schemaname, tablename, indexname;
