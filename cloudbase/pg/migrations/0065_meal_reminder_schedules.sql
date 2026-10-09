create table if not exists public.meal_reminder_schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner')),
  enabled boolean not null default false,
  reminder_time time not null,
  time_zone text not null check (char_length(time_zone) between 1 and 80),
  next_run_at timestamptz not null,
  last_dispatched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, meal_type)
);

create index if not exists meal_reminder_schedules_due
  on public.meal_reminder_schedules (next_run_at)
  where enabled = true;

alter table public.meal_reminder_schedules enable row level security;
revoke all on public.meal_reminder_schedules from public, anon, authenticated;
grant all on public.meal_reminder_schedules to service_role;

-- Rollback (manual): drop index meal_reminder_schedules_due, then drop table meal_reminder_schedules.
