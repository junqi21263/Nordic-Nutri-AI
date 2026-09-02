-- 0054: durable Trace and Worker observability records used by Admin Console.

create table if not exists public.ops_request_traces (
  id uuid primary key default gen_random_uuid(),
  trace_id text not null unique,
  client_request_id text,
  user_hash text,
  feature text not null,
  status text not null check (status in ('running', 'processing', 'succeeded', 'failed', 'cancelled', 'rate_limited', 'timed_out')),
  last_stage text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer,
  http_status integer,
  error_code text,
  provider text,
  provider_request_id_hash text,
  fallback_used boolean not null default false,
  stages_json jsonb not null default '[]'::jsonb,
  meta_json jsonb not null default '{}'::jsonb,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ops_request_traces_started_at_idx
  on public.ops_request_traces (started_at desc);
create index if not exists ops_request_traces_status_started_at_idx
  on public.ops_request_traces (status, started_at desc);
create index if not exists ops_request_traces_feature_started_at_idx
  on public.ops_request_traces (feature, started_at desc);
create index if not exists ops_request_traces_user_hash_started_at_idx
  on public.ops_request_traces (user_hash, started_at desc);
create index if not exists ops_request_traces_expires_at_idx
  on public.ops_request_traces (expires_at);

create table if not exists public.ops_job_runs (
  id uuid primary key default gen_random_uuid(),
  job_key text not null,
  configured boolean not null default false,
  runtime_binding_status text not null default 'unknown'
    check (runtime_binding_status in ('verified', 'unknown', 'unavailable')),
  trigger text not null default 'unknown'
    check (trigger in ('schedule', 'manual', 'internal', 'startup', 'unknown')),
  status text not null default 'failed'
    check (status in ('running', 'succeeded', 'failed', 'cancelled')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer,
  processed_count integer,
  error_code text,
  error_summary text,
  trace_id text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ops_job_runs_started_at_idx
  on public.ops_job_runs (started_at desc);
create index if not exists ops_job_runs_job_key_started_at_idx
  on public.ops_job_runs (job_key, started_at desc);
create index if not exists ops_job_runs_status_started_at_idx
  on public.ops_job_runs (status, started_at desc);

alter table public.ops_request_traces enable row level security;
alter table public.ops_job_runs enable row level security;
revoke all on public.ops_request_traces, public.ops_job_runs from public, anon, authenticated;

drop policy if exists "ops request traces: server only" on public.ops_request_traces;
create policy "ops request traces: server only"
  on public.ops_request_traces for all to public using (false) with check (false);

drop policy if exists "ops job runs: server only" on public.ops_job_runs;
create policy "ops job runs: server only"
  on public.ops_job_runs for all to public using (false) with check (false);
