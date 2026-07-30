-- One server-owned, data-versioned AI weekly review per user and end date.
-- The context hash invalidates the text when meals or the active plan changes.
create table if not exists public.weekly_nutrition_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  context_hash char(64) not null check (context_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null,
  provider text not null check (provider in ('deepseek', 'rule_v1')),
  model text check (model is null or char_length(btrim(model)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, end_date),
  check (start_date <= end_date)
);

create index if not exists weekly_nutrition_reviews_user_date_idx
  on public.weekly_nutrition_reviews (user_id, end_date desc);

drop trigger if exists weekly_nutrition_reviews_set_updated_at on public.weekly_nutrition_reviews;
create trigger weekly_nutrition_reviews_set_updated_at
  before update on public.weekly_nutrition_reviews
  for each row execute function public.set_updated_at();

revoke all on public.weekly_nutrition_reviews from public, anon, authenticated;
alter table public.weekly_nutrition_reviews enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'weekly_nutrition_reviews' and policyname = 'weekly reviews: server only'
  ) then
    create policy "weekly reviews: server only" on public.weekly_nutrition_reviews
      for all to public using (false) with check (false);
  end if;
end
$$;
