-- Align existing observability tables with the release schema without dropping rows.
alter table public.ops_request_traces
  alter column client_request_id type text using client_request_id::text,
  alter column expires_at drop default,
  alter column expires_at drop not null,
  add column if not exists created_at timestamptz;

update public.ops_request_traces
set created_at = started_at
where created_at is null;

alter table public.ops_request_traces
  alter column created_at set default now(),
  alter column created_at set not null;

alter table public.ops_request_traces
  drop constraint if exists ops_request_traces_status_check;
alter table public.ops_request_traces
  add constraint ops_request_traces_status_check
  check (status in ('running', 'processing', 'succeeded', 'failed', 'cancelled', 'rate_limited', 'timed_out'));

create index if not exists ops_request_traces_feature_started_at_idx
  on public.ops_request_traces (feature, started_at desc);
create index if not exists ops_request_traces_expires_at_idx
  on public.ops_request_traces (expires_at);

alter table public.ops_job_runs
  alter column trigger set default 'unknown',
  alter column status set default 'failed',
  alter column expires_at drop default,
  alter column expires_at drop not null,
  add column if not exists created_at timestamptz;

update public.ops_job_runs
set created_at = started_at
where created_at is null;

alter table public.ops_job_runs
  alter column created_at set default now(),
  alter column created_at set not null;

create index if not exists ops_job_runs_started_at_idx
  on public.ops_job_runs (started_at desc);
