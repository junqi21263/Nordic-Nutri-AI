-- Keep the user's selected meal portion as first-class data. Item quantities
-- remain a nutrition snapshot, but are not a reliable source for reconstructing
-- the selected percentage after legacy records have been edited.
alter table public.meal_records
  add column if not exists portion_multiplier numeric(3, 2)
  check (portion_multiplier is null or portion_multiplier in (0.25, 0.50, 0.75, 1.00, 1.25, 1.50, 1.75, 2.00));
