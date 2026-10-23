-- Publish the result and quota together; a failed quota write must not leave a
-- completed job that can subsequently be reported as failed by the worker.
create or replace function public.complete_vision_analysis(
  p_analysis_id uuid, p_expected_version bigint, p_response jsonb
)
returns table(accepted boolean, analysis_id uuid, version bigint)
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  if p_response is null or jsonb_typeof(p_response) <> 'object'
     or jsonb_typeof(p_response->'items') is distinct from 'array' then
    raise exception 'VISION_RESULT_INVALID';
  end if;
  if jsonb_array_length(p_response->'items') = 0 then
    raise exception 'VISION_RESULT_INVALID';
  end if;

  return query update public.ai_analysis as a
    set status='completed', current_stage='completed', execution_owner='none', dispatch_state='completed',
        lease_until=null, raw_recognition=p_response, normalized_items=p_response->'items',
        advice=p_response->>'advice',
        provider_attempt=greatest(a.provider_attempt, case when p_response->>'providerAttempt' ~ '^[0-9]+$' then (p_response->>'providerAttempt')::bigint else a.provider_attempt end),
        provider_completed_at=coalesce(a.provider_completed_at, case when p_response->>'providerAttempt' ~ '^[0-9]+$' then now() else a.provider_completed_at end),
        completed_at=now(), version=a.version+1, updated_at=now()
    where a.id=p_analysis_id and a.version=p_expected_version and a.execution_owner='async'
      and a.status not in ('completed','failed','timed_out','cancelled')
    returning true, a.id, a.version;
  if found then
    perform public.commit_vision_analysis_quota(p_analysis_id,p_response);
  end if;
end;
$$;
