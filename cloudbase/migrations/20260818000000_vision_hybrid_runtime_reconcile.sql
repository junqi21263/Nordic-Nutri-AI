-- Forward-only reconciliation for the manually applied 0048 runtime.
-- This migration is intentionally data-preserving: it never backfills status,
-- creates quota reservations, or rewrites existing analysis rows.

alter table public.ai_analysis add column if not exists current_stage text;
alter table public.ai_analysis add column if not exists quota_state text not null default 'none';
alter table public.ai_analysis add column if not exists execution_owner text not null default 'none';
alter table public.ai_analysis add column if not exists dispatch_state text not null default 'none';
alter table public.ai_analysis add column if not exists job_id uuid;
alter table public.ai_analysis add column if not exists lease_until timestamptz;
alter table public.ai_analysis add column if not exists version bigint not null default 0;
alter table public.ai_analysis add column if not exists deadline_at timestamptz;
alter table public.ai_analysis add column if not exists resume_stage text;
alter table public.ai_analysis add column if not exists provider_attempt integer not null default 0;
alter table public.ai_analysis add column if not exists provider_checkpoint jsonb;
alter table public.ai_analysis add column if not exists provider_completed_at timestamptz;
alter table public.ai_analysis add column if not exists completed_at timestamptz;
alter table public.ai_analysis add column if not exists fast_path_outcome text;
alter table public.ai_analysis add column if not exists async_trigger_reason text;
alter table public.ai_analysis add column if not exists trace_id text;
alter table private.vision_quota_reservations add column if not exists analysis_id uuid;
alter table private.vision_quota_reservations add column if not exists reservation_state text;
alter table private.vision_quota_reservations add column if not exists reservation_expires_at timestamptz;
alter table private.vision_quota_reservations add column if not exists reservation_id uuid default gen_random_uuid();
alter table public.uploaded_assets add column if not exists analysis_id uuid;
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'uploaded_assets_analysis_id_fkey'
      and conrelid = 'public.uploaded_assets'::regclass
  ) then
    alter table public.uploaded_assets
      add constraint uploaded_assets_analysis_id_fkey
      foreign key (analysis_id) references public.ai_analysis(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ai_analysis_async_status_check') then
    alter table public.ai_analysis add constraint ai_analysis_async_status_check
      check (status in ('created','uploaded','analyzing','enriching','persisting','completed','failed','timed_out','cancelled')) not valid;
  end if;
end $$;
create index if not exists uploaded_assets_analysis_id_idx on public.uploaded_assets(analysis_id);
create index if not exists ai_analysis_dispatch_claim_idx
  on public.ai_analysis(status, dispatch_state, lease_until, created_at);
create index if not exists ai_analysis_deadline_idx on public.ai_analysis(deadline_at);
create unique index if not exists vision_quota_reservations_analysis_id_idx
  on private.vision_quota_reservations(analysis_id) where analysis_id is not null;
-- Re-assert the corrected RPC definitions without changing their signatures.
create or replace function public.queue_vision_analysis(
  p_analysis_id uuid, p_expected_version bigint, p_resume_stage text,
  p_trigger_reason text, p_provider_attempt integer default 1
)
returns table(accepted boolean, analysis_id uuid, version bigint)
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if p_resume_stage not in ('analyzing', 'enriching') then raise exception 'invalid vision resume stage'; end if;
  return query update public.ai_analysis as a
    set status=p_resume_stage, current_stage=p_resume_stage, execution_owner='async',
        dispatch_state='queued', resume_stage=p_resume_stage, async_trigger_reason=p_trigger_reason,
        provider_attempt=greatest(1,p_provider_attempt), version=a.version+1, updated_at=now()
    where a.id=p_analysis_id and a.version=p_expected_version and a.execution_owner='fast'
      and a.status not in ('completed','failed','timed_out','cancelled')
    returning true, a.id, a.version;
end;
$$;
create or replace function public.checkpoint_vision_analysis(
  p_analysis_id uuid, p_expected_version bigint, p_provider_checkpoint jsonb,
  p_provider_attempt integer default 1
)
returns table(accepted boolean, analysis_id uuid, version bigint)
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  return query update public.ai_analysis as a
    set status='enriching', current_stage='enriching', resume_stage='enriching',
        provider_checkpoint=p_provider_checkpoint, provider_completed_at=now(),
        provider_attempt=greatest(1,p_provider_attempt), version=a.version+1, updated_at=now()
    where a.id=p_analysis_id and a.version=p_expected_version and a.execution_owner='fast'
      and a.status not in ('completed','failed','timed_out','cancelled')
    returning true, a.id, a.version;
end;
$$;
create or replace function public.complete_vision_analysis(
  p_analysis_id uuid, p_expected_version bigint, p_response jsonb
)
returns table(accepted boolean, analysis_id uuid, version bigint)
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  return query update public.ai_analysis as a
    set status='completed', current_stage='completed', execution_owner='none', dispatch_state='completed',
        lease_until=null, raw_recognition=p_response, normalized_items=coalesce(p_response->'items','[]'::jsonb),
        advice=p_response->>'advice', completed_at=now(), version=a.version+1, updated_at=now()
    where a.id=p_analysis_id and a.version=p_expected_version and a.execution_owner='async'
      and a.status not in ('completed','failed','timed_out','cancelled')
    returning true, a.id, a.version;
end;
$$;
create or replace function public.fail_vision_analysis(
  p_analysis_id uuid, p_expected_version bigint, p_status text, p_error_code text
)
returns table(accepted boolean, analysis_id uuid, version bigint)
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if p_status not in ('failed','timed_out','cancelled') then raise exception 'invalid vision terminal status'; end if;
  return query update public.ai_analysis as a
    set status=p_status, current_stage=p_status, execution_owner='none', dispatch_state='failed',
        lease_until=null, error_code=coalesce(nullif(p_error_code,''),'VISION_ANALYSIS_FAILED'),
        version=a.version+1, updated_at=now()
    where a.id=p_analysis_id and a.version=p_expected_version and a.execution_owner='async'
      and a.status not in ('completed','failed','timed_out','cancelled')
    returning true, a.id, a.version;
end;
$$;
do $$
begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='ai_analysis' and column_name='version')
    or not exists (select 1 from information_schema.columns where table_schema='public' and table_name='uploaded_assets' and column_name='analysis_id')
    or not exists (select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='queue_vision_analysis')
  then raise exception '0049 reconciliation readback failed'; end if;
end $$;
