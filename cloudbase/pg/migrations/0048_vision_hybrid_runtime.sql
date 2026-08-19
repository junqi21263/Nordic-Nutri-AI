-- Phase 2 local authoring only. Do not execute in production without a
-- separate migration approval. These RPCs make fast->async handoff and the
-- provider checkpoint version/CAS protected.

create or replace function public.queue_vision_analysis(
  p_analysis_id uuid,
  p_expected_version bigint,
  p_resume_stage text,
  p_trigger_reason text,
  p_provider_attempt integer default 1
)
returns table(accepted boolean, analysis_id uuid, version bigint)
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if p_resume_stage not in ('analyzing', 'enriching') then
    raise exception 'invalid vision resume stage';
  end if;

  return query
  update public.ai_analysis as a
  set status = p_resume_stage,
      current_stage = p_resume_stage,
      execution_owner = 'async',
      dispatch_state = 'queued',
      resume_stage = p_resume_stage,
      async_trigger_reason = p_trigger_reason,
      provider_attempt = greatest(1, p_provider_attempt),
      version = a.version + 1,
      updated_at = now()
  where a.id = p_analysis_id
    and a.version = p_expected_version
    and a.execution_owner = 'fast'
    and a.status not in ('completed', 'failed', 'timed_out', 'cancelled')
  returning true, a.id, a.version;
end;
$$;

create or replace function public.checkpoint_vision_analysis(
  p_analysis_id uuid,
  p_expected_version bigint,
  p_provider_checkpoint jsonb,
  p_provider_attempt integer default 1
)
returns table(accepted boolean, analysis_id uuid, version bigint)
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  return query
  update public.ai_analysis as a
  set status = 'enriching',
      current_stage = 'enriching',
      resume_stage = 'enriching',
      provider_checkpoint = p_provider_checkpoint,
      provider_completed_at = now(),
      provider_attempt = greatest(1, p_provider_attempt),
      version = a.version + 1,
      updated_at = now()
  where a.id = p_analysis_id
    and a.version = p_expected_version
    and a.execution_owner = 'fast'
    and a.status not in ('completed', 'failed', 'timed_out', 'cancelled')
  returning true, a.id, a.version;
end;
$$;

revoke all on function public.queue_vision_analysis(uuid,bigint,text,text,integer) from public;
revoke all on function public.checkpoint_vision_analysis(uuid,bigint,jsonb,integer) from public;

create or replace function public.complete_vision_analysis(
  p_analysis_id uuid,
  p_expected_version bigint,
  p_response jsonb
)
returns table(accepted boolean, analysis_id uuid, version bigint)
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  return query
  update public.ai_analysis as a
  set status = 'completed',
      current_stage = 'completed',
      execution_owner = 'none',
      dispatch_state = 'completed',
      lease_until = null,
      raw_recognition = p_response,
      normalized_items = coalesce(p_response->'items', '[]'::jsonb),
      advice = p_response->>'advice',
      completed_at = now(),
      version = a.version + 1,
      updated_at = now()
  where a.id = p_analysis_id
    and a.version = p_expected_version
    and a.execution_owner = 'async'
    and a.status not in ('completed', 'failed', 'timed_out', 'cancelled')
  returning true, a.id, a.version;
end;
$$;

create or replace function public.fail_vision_analysis(
  p_analysis_id uuid,
  p_expected_version bigint,
  p_status text,
  p_error_code text
)
returns table(accepted boolean, analysis_id uuid, version bigint)
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if p_status not in ('failed', 'timed_out', 'cancelled') then
    raise exception 'invalid vision terminal status';
  end if;

  return query
  update public.ai_analysis as a
  set status = p_status,
      current_stage = p_status,
      execution_owner = 'none',
      dispatch_state = 'failed',
      lease_until = null,
      error_code = coalesce(nullif(p_error_code, ''), 'VISION_ANALYSIS_FAILED'),
      version = a.version + 1,
      updated_at = now()
  where a.id = p_analysis_id
    and a.version = p_expected_version
    and a.execution_owner = 'async'
    and a.status not in ('completed', 'failed', 'timed_out', 'cancelled')
  returning true, a.id, a.version;
end;
$$;

revoke all on function public.complete_vision_analysis(uuid,bigint,jsonb) from public;
revoke all on function public.fail_vision_analysis(uuid,bigint,text,text) from public;
