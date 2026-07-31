-- One nutrition insight per food. context_hash invalidates when name/category/macros change.
create table if not exists public.food_nutrition_insights (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.foods(id) on delete cascade,
  context_hash char(64) not null check (context_hash ~ '^[0-9a-f]{64}$'),
  payload jsonb not null,
  provider text not null check (provider in ('cloudbase', 'deepseek', 'hunyuan-exp', 'rule_v1')),
  model text check (model is null or char_length(btrim(model)) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (food_id)
);

create index if not exists food_nutrition_insights_food_id_idx
  on public.food_nutrition_insights (food_id);

drop trigger if exists food_nutrition_insights_set_updated_at on public.food_nutrition_insights;
create trigger food_nutrition_insights_set_updated_at
  before update on public.food_nutrition_insights
  for each row execute function public.set_updated_at();

revoke all on public.food_nutrition_insights from public, anon, authenticated;
alter table public.food_nutrition_insights enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'food_nutrition_insights' and policyname = 'food nutrition insights: server only'
  ) then
    create policy "food nutrition insights: server only" on public.food_nutrition_insights
      for all to public using (false) with check (false);
  end if;
end
$$;
