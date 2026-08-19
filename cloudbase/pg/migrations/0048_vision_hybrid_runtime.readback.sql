select n.nspname as schema_name,
       p.proname as function_name,
       pg_get_function_identity_arguments(p.oid) as arguments
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'queue_vision_analysis',
    'checkpoint_vision_analysis',
    'complete_vision_analysis',
    'fail_vision_analysis'
  )
order by p.proname;

select id, status, execution_owner, dispatch_state, resume_stage,
       provider_attempt, version, deadline_at, expires_at
from public.ai_analysis
where execution_owner = 'async'
order by updated_at desc
limit 20;
