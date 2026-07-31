-- Cache one coach daily tip per user/date. context_hash invalidates the tip when
-- meals, targets, or preferences change so regenerated tips stay record-aware.
create table if not exists public.coach_daily_tips (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  tip_date date not null,
  context_hash char(64) not null check (context_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null,
  provider text not null check (provider in ('deepseek', 'hunyuan-exp', 'rule_v2')),
  model text check (model is null or char_length(btrim(model)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, tip_date)
);

create index if not exists coach_daily_tips_user_date_idx
  on public.coach_daily_tips (user_id, tip_date desc);

drop trigger if exists coach_daily_tips_set_updated_at on public.coach_daily_tips;
create trigger coach_daily_tips_set_updated_at
  before update on public.coach_daily_tips
  for each row execute function public.set_updated_at();

revoke all on public.coach_daily_tips from public, anon, authenticated;
alter table public.coach_daily_tips enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'coach_daily_tips' and policyname = 'coach daily tips: server only'
  ) then
    create policy "coach daily tips: server only" on public.coach_daily_tips
      for all to public using (false) with check (false);
  end if;
end
$$;
