-- Transport-smoke fixture RPCs only.
-- These functions create no quota reservation and are guarded by an explicit
-- trace marker plus purpose so cleanup cannot become a broad delete primitive.

create or replace function public.find_active_transport_fixtures(
  p_user_id uuid,
  p_trace_prefix text
)
returns table(
  fixture_analysis_id uuid,
  fixture_job_id uuid,
  client_request_id uuid,
  trace_id text
)
language sql
security definer
set search_path = public, pg_temp
as $$
  select a.id, a.job_id, a.client_request_id, a.trace_id
  from public.ai_analysis as a
  where a.user_id = p_user_id
    and a.trace_id like p_trace_prefix || '%'
    and a.provider = 'transport-smoke'
    and a.model = 'transport-smoke'
    and a.quota_state = 'none'
    and a.status not in ('completed', 'failed', 'timed_out', 'cancelled')
  order by a.created_at, a.id;
$$;

create or replace function public.create_transport_fixture(
  p_user_id uuid,
  p_analysis_id uuid,
  p_job_id uuid,
  p_client_request_id uuid,
  p_trace_id text,
  p_deadline_at timestamptz,
  p_purpose text
)
returns table(fixture_analysis_id uuid, fixture_job_id uuid, client_request_id uuid)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_purpose <> 'transport_smoke'
     or p_trace_id is null
     or p_trace_id not like 'transport-smoke-%'
     or p_user_id is null
     or p_analysis_id is null
     or p_job_id is null
     or p_client_request_id is null
     or p_deadline_at <= now() then
    raise exception 'invalid transport fixture';
  end if;

  if exists (
    select 1 from public.ai_analysis as a
    where a.user_id = p_user_id
      and a.trace_id like 'transport-smoke-%'
      and a.provider = 'transport-smoke'
      and a.model = 'transport-smoke'
      and a.quota_state = 'none'
      and a.status not in ('completed', 'failed', 'timed_out', 'cancelled')
  ) then
    raise exception 'active transport fixture already exists';
  end if;

  insert into public.ai_analysis(
    id, user_id, client_request_id, image_path, image_sha256,
    provider, model, status, current_stage, quota_state,
    execution_owner, dispatch_state, job_id, deadline_at, expires_at,
    trace_id, provider_attempt, version, updated_at
  ) values (
    p_analysis_id, p_user_id, p_client_request_id,
    'transport-smoke', null, 'transport-smoke', 'transport-smoke',
    'analyzing', 'analyzing', 'none', 'none', 'queued', p_job_id,
    p_deadline_at, p_deadline_at, p_trace_id, 0, 0, now()
  );

  return query select p_analysis_id, p_job_id, p_client_request_id;
end;
$$;

create or replace function public.cleanup_transport_fixture(
  p_analysis_id uuid,
  p_job_id uuid,
  p_client_request_id uuid,
  p_purpose text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  if p_purpose <> 'transport_smoke' then
    raise exception 'invalid transport fixture purpose';
  end if;

  delete from public.ai_analysis as a
  where a.id = p_analysis_id
    and a.job_id = p_job_id
    and a.client_request_id = p_client_request_id
    and a.trace_id like 'transport-smoke-%'
    and a.provider = 'transport-smoke'
    and a.model = 'transport-smoke'
    and a.quota_state = 'none'
    and a.status not in ('completed', 'failed', 'timed_out', 'cancelled');

  get diagnostics v_deleted = row_count;
  return v_deleted = 1;
end;
$$;

revoke all on function public.find_active_transport_fixtures(uuid,text) from public;
revoke all on function public.create_transport_fixture(uuid,uuid,uuid,uuid,text,timestamptz,text) from public;
revoke all on function public.cleanup_transport_fixture(uuid,uuid,uuid,text) from public;
