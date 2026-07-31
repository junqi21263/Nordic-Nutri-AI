-- Link meal items to catalog foods; cache DeepSeek meal insight on the meal row.
alter table public.meal_records
  add column if not exists insight text
    check (insight is null or char_length(btrim(insight)) between 1 and 1000);

alter table public.meal_items
  add column if not exists food_id uuid references public.foods(id) on delete set null;

create index if not exists meal_items_food_id_idx
  on public.meal_items (food_id);
