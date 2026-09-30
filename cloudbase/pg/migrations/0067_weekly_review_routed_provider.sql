-- V2 keeps the existing cache table and owner isolation. Model routing can use
-- providers other than DeepSeek; keep the actual provider instead of mislabelling it.
begin;
alter table public.weekly_nutrition_reviews
  drop constraint if exists weekly_nutrition_reviews_provider_check;
alter table public.weekly_nutrition_reviews
  add constraint weekly_nutrition_reviews_provider_check
  check (char_length(btrim(provider)) between 1 and 80);
commit;
