-- Per-rule patrol interval: timer may wake often; each rule only creates a
-- batch when interval_minutes have elapsed since last_run_at.

alter table public.food_image_patrol_rules
  add column if not exists interval_minutes integer not null default 60
    check (interval_minutes between 30 and 1440);

comment on column public.food_image_patrol_rules.interval_minutes is
  'Minimum minutes between automatic patrol runs for this rule (30–1440). Manual run-now bypasses.';
