-- Launch-readiness: durable server-side idempotency, per-user quotas, and
-- short-lived cancellation audit rows. All rows cascade with the product user
-- so a completed account cancellation retains no user-owned audit record.

create table if not exists private.operation_requests (
  user_id uuid not null references public.app_users(id) on delete cascade,
  operation text not null check (char_length(operation) between 1 and 80),
  client_request_id uuid not null,
  state text not null check (state in ('started', 'succeeded', 'failed')),
  response jsonb,
  error_code text check (error_code is null or char_length(error_code) between 1 and 80),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, operation, client_request_id),
  check ((state = 'started' and completed_at is null) or (state in ('succeeded', 'failed') and completed_at is not null))
);

create table if not exists private.rate_limit_windows (
  user_id uuid not null references public.app_users(id) on delete cascade,
  operation text not null check (char_length(operation) between 1 and 80),
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, operation, window_started_at)
);

create table if not exists public.account_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  client_request_id uuid not null,
  outcome text not null check (outcome in ('started', 'succeeded', 'failed')),
  error_code text check (error_code is null or char_length(error_code) between 1 and 80),
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, client_request_id)
);

create index if not exists operation_requests_created_at_idx
on private.operation_requests (created_at);

create index if not exists rate_limit_windows_updated_at_idx
on private.rate_limit_windows (updated_at);

-- A single INSERT ... ON CONFLICT claim is the concurrency boundary for all
-- client-retriable writes. Callers may execute the work only when claimed is
-- true; a completed response can be safely returned to a duplicate caller.
create or replace function public.claim_operation_request(
  p_user_id uuid,
  p_operation text,
  p_client_request_id uuid
)
returns table (state text, response jsonb, error_code text, claimed boolean)
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  insert into private.operation_requests (user_id, operation, client_request_id, state)
  values (p_user_id, p_operation, p_client_request_id, 'started')
  on conflict (user_id, operation, client_request_id) do nothing;

  if found then
    return query select 'started'::text, null::jsonb, null::text, true;
    return;
  end if;

  return query
  select request.state, request.response, request.error_code, false
  from private.operation_requests request
  where request.user_id = p_user_id
    and request.operation = p_operation
    and request.client_request_id = p_client_request_id;
end;
$$;

create or replace function public.complete_operation_request(
  p_user_id uuid,
  p_operation text,
  p_client_request_id uuid,
  p_state text,
  p_response jsonb default null,
  p_error_code text default null
)
returns void
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
begin
  if p_state not in ('succeeded', 'failed') then
    raise exception 'operation completion state is invalid';
  end if;

  update private.operation_requests
  set state = p_state,
      response = p_response,
      error_code = p_error_code,
      completed_at = now()
  where user_id = p_user_id
    and operation = p_operation
    and client_request_id = p_client_request_id
    and state = 'started';

  if not found then
    raise exception 'operation request is not claimable';
  end if;
end;
$$;

alter table private.operation_requests enable row level security;
alter table private.rate_limit_windows enable row level security;
alter table public.account_deletion_audit enable row level security;

revoke all on private.operation_requests, private.rate_limit_windows, public.account_deletion_audit from public, anon, authenticated;
revoke all on function public.claim_operation_request(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.complete_operation_request(uuid, text, uuid, text, jsonb, text) from public, anon, authenticated;
grant execute on function public.claim_operation_request(uuid, text, uuid) to service_role;
grant execute on function public.complete_operation_request(uuid, text, uuid, text, jsonb, text) to service_role;

create policy "operation requests: server only"
on private.operation_requests for all to public using (false) with check (false);

create policy "rate limit windows: server only"
on private.rate_limit_windows for all to public using (false) with check (false);

create policy "account deletion audit: server only"
on public.account_deletion_audit for all to public using (false) with check (false);
