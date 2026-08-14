-- Milestone V1 durable state. All mutations remain server-owned through the
-- product HTTPS function; the mini program never writes these tables directly.

alter table public.meal_records
  add column if not exists plan_id uuid references public.nutrition_plans(id) on delete set null;

create index if not exists meal_records_user_plan_idx
  on public.meal_records (user_id, plan_id)
  where deleted_at is null;

create table if not exists public.streak_cycles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  start_date date not null,
  end_date date,
  status text not null check (status in ('active', 'ended', 'merged')),
  canonical_cycle_id uuid references public.streak_cycles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date),
  check (
    (status = 'merged' and canonical_cycle_id is not null)
    or (status <> 'merged' and canonical_cycle_id is null)
  )
);

create unique index if not exists streak_cycles_one_active_per_user_idx
  on public.streak_cycles (user_id)
  where status = 'active';

create index if not exists streak_cycles_user_start_idx
  on public.streak_cycles (user_id, start_date desc);

drop trigger if exists streak_cycles_set_updated_at on public.streak_cycles;
create trigger streak_cycles_set_updated_at
  before update on public.streak_cycles
  for each row execute function public.set_updated_at();

create table if not exists public.milestone_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  cycle_id uuid not null references public.streak_cycles(id) on delete restrict,
  milestone smallint not null check (milestone in (3, 7, 14, 30)),
  achieved_at timestamptz not null,
  source text not null check (source in ('normal_record', 'backfill')),
  status text not null check (status in ('pending', 'presented', 'invalidated')),
  presentation_snapshot jsonb,
  presentation_claimed_at timestamptz,
  presentation_claim_token uuid,
  shown_at timestamptz,
  shared_at timestamptz,
  share_count integer not null default 0 check (share_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, cycle_id, milestone),
  check (
    (status = 'pending' and shown_at is null)
    or (status = 'presented' and shown_at is not null and presentation_snapshot is not null)
    or status = 'invalidated'
  ),
  check (
    (presentation_claimed_at is null and presentation_claim_token is null)
    or (presentation_claimed_at is not null and presentation_claim_token is not null)
  )
);

create index if not exists milestone_events_user_cycle_idx
  on public.milestone_events (user_id, cycle_id, milestone);

create index if not exists milestone_events_pending_claim_idx
  on public.milestone_events (user_id, milestone desc, achieved_at asc)
  where status = 'pending';

drop trigger if exists milestone_events_set_updated_at on public.milestone_events;
create trigger milestone_events_set_updated_at
  before update on public.milestone_events
  for each row execute function public.set_updated_at();

revoke all on public.streak_cycles from public, anon, authenticated;
alter table public.streak_cycles enable row level security;

revoke all on public.milestone_events from public, anon, authenticated;
alter table public.milestone_events enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'streak_cycles' and policyname = 'streak cycles: server only'
  ) then
    create policy "streak cycles: server only" on public.streak_cycles
      for all to public using (false) with check (false);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'milestone_events' and policyname = 'milestone events: server only'
  ) then
    create policy "milestone events: server only" on public.milestone_events
      for all to public using (false) with check (false);
  end if;
end
$$;
