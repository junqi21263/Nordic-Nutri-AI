-- Read-only verification for 0047. Run manually against a controlled database;
-- this file performs no writes.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'ai_analysis'
  and column_name in (
    'current_stage','quota_state','execution_owner','dispatch_state','job_id',
    'lease_until','version','deadline_at','resume_stage','provider_attempt',
    'provider_checkpoint','completed_at','fast_path_outcome','async_trigger_reason','trace_id'
  )
order by column_name;

select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'uploaded_assets'
  and column_name = 'analysis_id';

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'create_vision_analysis','claim_vision_analysis_job','reclaim_vision_analysis_jobs',
    'commit_vision_analysis_quota','release_vision_analysis_quota'
  )
order by routine_name;

select marker, cardinality(legacy_analysis_ids) as legacy_row_count, backfilled_at
from private.vision_async_migration_markers
where marker = 'legacy_status_backfill';
