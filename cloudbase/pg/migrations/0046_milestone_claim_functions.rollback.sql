drop function if exists public.record_milestone_event_share(uuid, uuid);
drop function if exists public.confirm_milestone_event_presented(uuid, uuid, uuid, jsonb);
drop function if exists public.claim_pending_milestone_event(uuid, integer);
