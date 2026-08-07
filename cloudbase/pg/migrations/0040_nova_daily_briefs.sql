-- Cache one proactive NOVA reminder per user/date. The server owns both
-- generation and reads; the context hash invalidates stale daily data safely.
create table if not exists public.nova_daily_briefs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  brief_date date not null,
  context_hash char(64) not null check (context_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null,
  provider text not null check (provider in ('deepseek', 'hunyuan-exp', 'rule_v2')),
  model text check (model is null or char_length(btrim(model)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, brief_date)
);

create index if not exists nova_daily_briefs_user_date_idx
  on public.nova_daily_briefs (user_id, brief_date desc);

drop trigger if exists nova_daily_briefs_set_updated_at on public.nova_daily_briefs;
create trigger nova_daily_briefs_set_updated_at
  before update on public.nova_daily_briefs
  for each row execute function public.set_updated_at();

revoke all on public.nova_daily_briefs from public, anon, authenticated;
alter table public.nova_daily_briefs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'nova_daily_briefs' and policyname = 'nova daily briefs: server only'
  ) then
    create policy "nova daily briefs: server only" on public.nova_daily_briefs
      for all to public using (false) with check (false);
  end if;
end
$$;
