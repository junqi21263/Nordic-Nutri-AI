-- Roll back only Phase 1 schema additions. Run only before Phase 2 writes
-- milestone events in a production environment, otherwise preserve history.

drop table if exists public.milestone_events;
drop table if exists public.streak_cycles;

drop index if exists public.meal_records_user_plan_idx;
alter table public.meal_records drop column if exists plan_id;
