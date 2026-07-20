-- Persist the user's current daily calorie target alongside the versioned health goal.
alter table public.user_goals
  add column if not exists target_calories_kcal numeric(6, 0)
  check (target_calories_kcal is null or target_calories_kcal between 1000 and 6000);
