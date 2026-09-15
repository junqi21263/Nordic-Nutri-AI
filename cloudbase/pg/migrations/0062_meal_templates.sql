-- Independent personal templates. Only product-session server may access them.
create table public.meal_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  source_meal_id uuid references public.meal_records(id) on delete set null,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  meal_type text not null check (meal_type in ('breakfast','lunch','dinner','snack')),
  image_path text,
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, source_meal_id)
);
alter table public.meal_records add column template_id uuid references public.meal_templates(id) on delete set null;
create index meal_templates_owner on public.meal_templates(user_id, updated_at desc);
create index meal_records_template on public.meal_records(user_id, template_id, recorded_at desc) where deleted_at is null;
alter table public.meal_templates enable row level security;
revoke all on public.meal_templates from anon, authenticated;
grant all on public.meal_templates to service_role;
