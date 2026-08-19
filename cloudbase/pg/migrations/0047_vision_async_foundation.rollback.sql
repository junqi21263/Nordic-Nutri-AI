-- Bounded rollback for 0047.  Only rows explicitly recorded by the legacy
-- backfill marker are restored; newly-created completed analyses are untouched.
do $$
declare
  v_ids uuid[];
begin
  select legacy_analysis_ids into v_ids
  from private.vision_async_migration_markers
  where marker = 'legacy_status_backfill';
  if v_ids is not null then
    update public.ai_analysis
    set status = 'succeeded'
    where id = any(v_ids) and status = 'completed';
  end if;
end $$;

alter table public.ai_analysis add constraint ai_analysis_status_check
  check (status in ('pending','processing','succeeded','failed','saved','expired')) not valid;

drop function if exists public.release_vision_analysis_quota(uuid);
drop function if exists public.commit_vision_analysis_quota(uuid,jsonb);
drop function if exists public.reclaim_vision_analysis_jobs(integer);
drop function if exists public.claim_vision_analysis_job(integer,integer);
drop function if exists public.create_vision_analysis(uuid,uuid,uuid,text,text,timestamptz,timestamptz,text,text);
drop index if exists private.vision_quota_reservations_analysis_id_idx;
drop index if exists public.ai_analysis_deadline_idx;
drop index if exists public.ai_analysis_dispatch_claim_idx;
drop index if exists public.uploaded_assets_analysis_id_idx;
alter table public.uploaded_assets drop constraint if exists uploaded_assets_analysis_id_fkey;
alter table public.uploaded_assets drop column if exists analysis_id;
alter table private.vision_quota_reservations drop column if exists reservation_expires_at;
alter table private.vision_quota_reservations drop column if exists reservation_state;
alter table private.vision_quota_reservations drop column if exists analysis_id;
alter table private.vision_quota_reservations drop column if exists reservation_id;
alter table public.ai_analysis drop constraint if exists ai_analysis_async_status_check;
alter table public.ai_analysis drop column if exists trace_id;
alter table public.ai_analysis drop column if exists async_trigger_reason;
alter table public.ai_analysis drop column if exists fast_path_outcome;
alter table public.ai_analysis drop column if exists completed_at;
alter table public.ai_analysis drop column if exists provider_completed_at;
alter table public.ai_analysis drop column if exists provider_checkpoint;
alter table public.ai_analysis drop column if exists provider_attempt;
alter table public.ai_analysis drop column if exists resume_stage;
alter table public.ai_analysis drop column if exists deadline_at;
alter table public.ai_analysis drop column if exists version;
alter table public.ai_analysis drop column if exists lease_until;
alter table public.ai_analysis drop column if exists job_id;
alter table public.ai_analysis drop column if exists dispatch_state;
alter table public.ai_analysis drop column if exists execution_owner;
alter table public.ai_analysis drop column if exists quota_state;
alter table public.ai_analysis drop column if exists current_stage;
drop table if exists private.vision_async_migration_markers;
