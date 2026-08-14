-- Atomic server-side milestone presentation claim/confirmation.
-- Client roles have no direct policies on milestone_events.

create or replace function public.claim_pending_milestone_event(
  p_user_id uuid,
  p_ttl_seconds integer default 900
)
returns table (
  id uuid,
  user_id uuid,
  cycle_id uuid,
  milestone smallint,
  achieved_at timestamptz,
  source text,
  presentation_claimed_at timestamptz,
  presentation_claim_token uuid
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token uuid := gen_random_uuid();
begin
  if p_ttl_seconds < 60 or p_ttl_seconds > 3600 then
    raise exception 'invalid milestone claim ttl';
  end if;

  return query
  with candidate as (
    select event.id
    from public.milestone_events event
    where event.user_id = p_user_id
      and event.status = 'pending'
      and (
        event.presentation_claimed_at is null
        or event.presentation_claimed_at < now() - make_interval(secs => p_ttl_seconds)
      )
    order by event.milestone desc, event.achieved_at asc, event.id asc
    for update skip locked
    limit 1
  ), claimed as (
    update public.milestone_events event
    set presentation_claimed_at = now(), presentation_claim_token = v_token
    from candidate
    where event.id = candidate.id
    returning event.*
  )
  select claimed.id, claimed.user_id, claimed.cycle_id, claimed.milestone,
         claimed.achieved_at, claimed.source, claimed.presentation_claimed_at,
         claimed.presentation_claim_token
  from claimed;
end;
$$;

create or replace function public.confirm_milestone_event_presented(
  p_user_id uuid,
  p_event_id uuid,
  p_claim_token uuid,
  p_snapshot jsonb
)
returns table (id uuid, status text, presentation_snapshot jsonb, shown_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_snapshot is null then
    raise exception 'milestone snapshot is required';
  end if;

  return query
  update public.milestone_events event
  set status = 'presented', presentation_snapshot = p_snapshot, shown_at = now()
  where event.id = p_event_id
    and event.user_id = p_user_id
    and event.status = 'pending'
    and event.presentation_claim_token = p_claim_token
  returning event.id, event.status, event.presentation_snapshot, event.shown_at;
end;
$$;

revoke all on function public.claim_pending_milestone_event(uuid, integer) from public;
revoke all on function public.confirm_milestone_event_presented(uuid, uuid, uuid, jsonb) from public;

create or replace function public.record_milestone_event_share(
  p_user_id uuid,
  p_event_id uuid
)
returns table (id uuid, share_count integer, shared_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  update public.milestone_events event
  set shared_at = now(), share_count = event.share_count + 1
  where event.id = p_event_id and event.user_id = p_user_id and event.status = 'presented'
  returning event.id, event.share_count, event.shared_at;
end;
$$;

revoke all on function public.record_milestone_event_share(uuid, uuid) from public;
