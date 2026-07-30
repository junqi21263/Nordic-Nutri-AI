-- One server-owned, data-versioned daily insight per user and date. The context
-- hash makes the cached text invalid as soon as recorded meals or targets change.
create table if not exists public.daily_nutrition_insights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  insight_date date not null,
  context_hash char(64) not null check (context_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null,
  provider text not null check (provider in ('cloudbase', 'deepseek', 'hunyuan-exp', 'rule_v3')),
  model text check (model is null or char_length(btrim(model)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, insight_date)
);

create index if not exists daily_nutrition_insights_user_date_idx
  on public.daily_nutrition_insights (user_id, insight_date desc);

drop trigger if exists daily_nutrition_insights_set_updated_at on public.daily_nutrition_insights;
create trigger daily_nutrition_insights_set_updated_at
  before update on public.daily_nutrition_insights
  for each row execute function public.set_updated_at();

revoke all on public.daily_nutrition_insights from public, anon, authenticated;
alter table public.daily_nutrition_insights enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'daily_nutrition_insights' and policyname = 'daily insights: server only'
  ) then
    create policy "daily insights: server only" on public.daily_nutrition_insights
      for all to public using (false) with check (false);
  end if;
end
$$;
