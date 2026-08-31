-- 0053: server-only audit records for admin mutations.
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id text,
  action text not null check (char_length(action) between 1 and 120),
  resource_type text not null check (char_length(resource_type) between 1 and 80),
  resource_id text,
  before_snapshot jsonb not null default '{}'::jsonb,
  after_snapshot jsonb not null default '{}'::jsonb,
  result text not null check (result in ('succeeded', 'failed', 'rejected')),
  error_code text,
  trace_id text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_at_idx
  on public.admin_audit_logs (created_at desc);

create index if not exists admin_audit_logs_resource_idx
  on public.admin_audit_logs (resource_type, resource_id, created_at desc);

alter table public.admin_audit_logs enable row level security;
revoke all on public.admin_audit_logs from public, anon, authenticated;
drop policy if exists "admin audit logs: server only" on public.admin_audit_logs;
create policy "admin audit logs: server only"
  on public.admin_audit_logs for all to public using (false) with check (false);
