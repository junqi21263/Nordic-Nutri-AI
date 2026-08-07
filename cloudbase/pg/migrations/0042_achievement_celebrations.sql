-- Celebration delivery is server-owned: a completed achievement remains pending
-- until the client confirms that its unlock overlay was actually shown.
alter table public.user_achievements
  add column if not exists celebrated_at timestamptz;

-- Keep a short recovery window for releases that missed a celebration, while
-- treating older historical completions as already acknowledged.
update public.user_achievements
set celebrated_at = completed_at
where celebrated_at is null
  and completed_at < now() - interval '2 hours';

create index if not exists user_achievements_pending_celebration_idx
  on public.user_achievements (user_id, completed_at desc)
  where celebrated_at is null;
