-- Nutrition-plan persistence for the final onboarding step.

create table if not exists public.nutrition_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  goal_id uuid not null references public.user_goals(id) on delete cascade,
  body_profile_id uuid not null references public.body_profiles(id) on delete cascade,
  daily_calories_kcal numeric(6, 0) not null check (daily_calories_kcal between 800 and 10000),
  protein_g numeric(6, 1) not null check (protein_g > 0),
  carbs_g numeric(6, 1) not null check (carbs_g >= 0),
  fat_g numeric(6, 1) not null check (fat_g > 0),
  calculation_source text not null default 'formula_v1' check (calculation_source in ('formula_v1', 'manual')),
  status text not null default 'active' check (status in ('draft', 'active', 'superseded', 'archived', 'completed')),
  version integer not null default 1 check (version > 0),
  effective_from timestamptz not null default now(),
  effective_to timestamptz,
  activated_at timestamptz,
  archived_at timestamptz,
  generation_request_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_to is null or effective_to > effective_from),
  check (archived_at is null or archived_at >= created_at)
);

alter table public.user_goals
  alter column user_id set default private.current_app_user_id();

alter table public.body_profiles
  alter column user_id set default private.current_app_user_id();

alter table public.nutrition_plans
  alter column user_id set default private.current_app_user_id();

create unique index if not exists nutrition_plans_one_active_per_user_idx
on public.nutrition_plans (user_id) where status = 'active';

create index if not exists nutrition_plans_user_status_effective_from_idx
on public.nutrition_plans (user_id, status, effective_from desc);

grant select, insert on public.nutrition_plans to authenticated;
alter table public.nutrition_plans enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'nutrition_plans' and policyname = 'plans: read own rows'
  ) then
    create policy "plans: read own rows"
      on public.nutrition_plans for select to authenticated
      using (user_id = private.current_app_user_id());
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'nutrition_plans' and policyname = 'plans: insert own rows'
  ) then
    create policy "plans: insert own rows"
      on public.nutrition_plans for insert to authenticated
      with check (user_id = private.current_app_user_id());
  end if;
end
$$;
