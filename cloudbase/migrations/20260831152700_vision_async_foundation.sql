-- Phase 1 only: author the async foundation.  This migration is not executed
-- by this change.  The marker table makes historical status backfill reversible
-- without touching rows created after this migration.

create table if not exists private.vision_async_migration_markers (
  marker text primary key,
  legacy_analysis_ids uuid[] not null default '{}',
  backfilled_at timestamptz not null default now()
);

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
end $$;

-- Capture exactly the rows belonging to the legacy backfill before changing them.
-- Legacy status transition: succeeded -> completed.
alter table public.ai_analysis drop constraint if exists ai_analysis_status_check;

insert into private.vision_async_migration_markers(marker, legacy_analysis_ids)
select 'legacy_status_backfill', coalesce(array_agg(id order by id), '{}')
from public.ai_analysis
where status = 'succeeded'
on conflict (marker) do nothing;

update public.ai_analysis a
set status = 'completed', completed_at = coalesce(a.completed_at, a.updated_at, now())
where a.id in (
  select unnest(legacy_analysis_ids)
  from private.vision_async_migration_markers
  where marker = 'legacy_status_backfill'
)
  and a.status = 'succeeded';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ai_analysis_async_status_check') then
    alter table public.ai_analysis add constraint ai_analysis_async_status_check
      check (status in ('created','uploaded','analyzing','enriching','persisting','completed','failed','timed_out','cancelled')) not valid;
  end if;
end $$;

update private.vision_quota_reservations
set reservation_state = coalesce(reservation_state, state),
    reservation_expires_at = coalesce(reservation_expires_at, expires_at);

create index if not exists uploaded_assets_analysis_id_idx on public.uploaded_assets(analysis_id);
create index if not exists ai_analysis_dispatch_claim_idx
  on public.ai_analysis(status, dispatch_state, lease_until, created_at);
create index if not exists ai_analysis_deadline_idx on public.ai_analysis(deadline_at);
create unique index if not exists vision_quota_reservations_analysis_id_idx
  on private.vision_quota_reservations(analysis_id) where analysis_id is not null;

create or replace function public.create_vision_analysis(
  p_analysis_id uuid,
  p_user_id uuid,
  p_client_request_id uuid,
  p_provider text,
  p_model text,
  p_deadline_at timestamptz,
  p_reservation_expires_at timestamptz,
  p_image_path text default null,
  p_image_sha256 text default null
)
returns table(analysis_id uuid, status text, quota_state text, reservation_id uuid, reused boolean)
language plpgsql security definer set search_path = public, private, pg_temp
as $$
declare
  v_existing public.ai_analysis%rowtype;
  v_reservation_id uuid;
  v_quota record;
begin
  if p_user_id is null or p_client_request_id is null or p_analysis_id is null then
    raise exception 'vision analysis identity is required';
  end if;

  select * into v_existing from public.ai_analysis
  where user_id = p_user_id and client_request_id = p_client_request_id
  for update;
  if found then
    select q.reservation_id into v_reservation_id from private.vision_quota_reservations q
    where q.analysis_id = v_existing.id or (q.user_id = p_user_id and q.client_request_id = p_client_request_id)
    order by created_at desc limit 1;
    return query select v_existing.id, v_existing.status, v_existing.quota_state, v_reservation_id, true;
    return;
  end if;

  insert into public.ai_analysis(
    id, user_id, client_request_id, image_path, image_sha256, provider, model,
    status, quota_state, execution_owner, dispatch_state, deadline_at, expires_at
  ) values (
    p_analysis_id, p_user_id, p_client_request_id, p_image_path, p_image_sha256,
    p_provider, p_model, 'created', 'reserved', 'fast', 'none',
    p_deadline_at, p_reservation_expires_at
  ) on conflict (user_id, client_request_id) do nothing
  returning id into v_existing.id;

  if v_existing.id is null then
    select * into v_existing from public.ai_analysis
    where user_id = p_user_id and client_request_id = p_client_request_id
    for update;
    select q.reservation_id into v_reservation_id from private.vision_quota_reservations q
    where q.analysis_id = v_existing.id or (q.user_id = p_user_id and q.client_request_id = p_client_request_id)
    order by created_at desc limit 1;
    return query select v_existing.id, v_existing.status, v_existing.quota_state, v_reservation_id, true;
    return;
  end if;

  -- Reuse the existing quota limiter inside this transaction, then extend its
  -- reservation expiry to the analysis deadline plus grace. Any failure rolls
  -- back both the analysis row and the quota reservation.
  select * into v_quota from public.reserve_vision_quota(
    p_user_id, p_client_request_id, 10, 86400, 3, 600,
    greatest(1, ceil(extract(epoch from (p_reservation_expires_at - now())))::integer)
  );
  if coalesce(v_quota.allowed, false) is not true then
    raise exception 'vision quota unavailable';
  end if;
  update private.vision_quota_reservations
  set analysis_id = v_existing.id,
      reservation_state = 'reserved',
      reservation_expires_at = p_reservation_expires_at,
      expires_at = p_reservation_expires_at
  where user_id = p_user_id and client_request_id = p_client_request_id;
  select q.reservation_id into v_reservation_id from private.vision_quota_reservations q
  where q.user_id = p_user_id and q.client_request_id = p_client_request_id;

  return query select v_existing.id, 'created'::text, 'reserved'::text, v_reservation_id, false;
exception when others then
  -- The function is one transaction: either both rows are present or neither is.
  raise;
end;
$$;

create or replace function public.claim_vision_analysis_job(
  p_limit integer default 1,
  p_lease_seconds integer default 60
)
returns setof public.ai_analysis
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  return query
  with candidates as (
    select id from public.ai_analysis
    where status in ('created','uploaded','analyzing','enriching','persisting')
      and (dispatch_state = 'queued' or (lease_until is not null and lease_until < now()))
    order by created_at, id
    for update skip locked limit greatest(1, least(p_limit, 50))
  )
  update public.ai_analysis a
  set status = case when a.status in ('created','uploaded') then 'analyzing' else a.status end,
      execution_owner = 'async', dispatch_state = 'running',
      job_id = coalesce(a.job_id, gen_random_uuid()), lease_until = now() + make_interval(secs => p_lease_seconds),
      version = a.version + 1, updated_at = now()
  from candidates c where a.id = c.id returning a.*;
end;
$$;

create or replace function public.reclaim_vision_analysis_jobs(p_limit integer default 100)
returns setof public.ai_analysis
language plpgsql security definer set search_path = public, pg_temp
as $$
begin
  return query
  update public.ai_analysis a
  set dispatch_state = 'queued', execution_owner = 'async', lease_until = null,
      version = a.version + 1, updated_at = now()
  where a.id in (
    select id from public.ai_analysis
    where dispatch_state in ('claimed','running') and lease_until < now()
    order by lease_until, id for update skip locked limit greatest(1, least(p_limit, 500))
  ) returning a.*;
end;
$$;

create or replace function public.commit_vision_analysis_quota(p_analysis_id uuid, p_response jsonb default null)
returns boolean language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  update private.vision_quota_reservations
  set state = 'committed', reservation_state = 'committed', response = coalesce(p_response, response)
  where analysis_id = p_analysis_id and coalesce(reservation_state, state) = 'reserved';
  update public.ai_analysis set quota_state = 'committed' where id = p_analysis_id;
  return true;
end; $$;

create or replace function public.release_vision_analysis_quota(p_analysis_id uuid)
returns boolean language plpgsql security definer set search_path = public, private, pg_temp as $$
begin
  update private.vision_quota_reservations
  set state = 'released', reservation_state = 'released'
  where analysis_id = p_analysis_id and coalesce(reservation_state, state) = 'reserved';
  update public.ai_analysis set quota_state = 'released' where id = p_analysis_id;
  return true;
end; $$;

revoke all on function public.create_vision_analysis(uuid,uuid,uuid,text,text,timestamptz,timestamptz,text,text) from public;
revoke all on function public.claim_vision_analysis_job(integer,integer) from public;
revoke all on function public.reclaim_vision_analysis_jobs(integer) from public;
revoke all on function public.commit_vision_analysis_quota(uuid,jsonb) from public;
revoke all on function public.release_vision_analysis_quota(uuid) from public;
