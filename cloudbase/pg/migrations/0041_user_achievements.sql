-- Permanent user milestones: achievement progress may be recalculated, but once
-- a user completes an achievement it remains completed even if meal data changes.
create table if not exists public.user_achievements (
  user_id uuid not null references public.app_users(id) on delete cascade,
  achievement_id text not null check (char_length(btrim(achievement_id)) between 1 and 80),
  completed_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);

create index if not exists user_achievements_user_completed_idx
  on public.user_achievements (user_id, completed_at desc);

revoke all on public.user_achievements from public, anon, authenticated;
alter table public.user_achievements enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_achievements' and policyname = 'user achievements: server only'
  ) then
    create policy "user achievements: server only" on public.user_achievements
      for all to public using (false) with check (false);
  end if;
end
$$;
