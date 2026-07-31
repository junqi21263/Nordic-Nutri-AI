-- Watched categories for automatic food-image batch creation.
-- Scheduler creates draft→running batches; humans only review candidates.
-- Excludes foods that already have an approved primary for the rule's visual profile
-- (enforced in listBatchImageCandidates, not in this table).

create table if not exists public.food_image_patrol_rules (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.food_categories(id) on delete cascade,
  visual_profile_key text not null default 'auto'
    check (visual_profile_key in ('auto', 'standard', 'raw', 'cooked_plain', 'cooked_grilled', 'fresh', 'dry')),
  batch_size integer not null default 20
    check (batch_size between 1 and 100),
  enabled boolean not null default true,
  created_by uuid not null references public.app_users(id) on delete cascade,
  last_run_at timestamptz,
  last_batch_id uuid references public.food_image_batches(id) on delete set null,
  last_error text
    check (last_error is null or char_length(last_error) <= 800),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (category_id, visual_profile_key)
);

create index if not exists food_image_patrol_rules_enabled_idx
  on public.food_image_patrol_rules (enabled, last_run_at nulls first);

drop trigger if exists food_image_patrol_rules_set_updated_at on public.food_image_patrol_rules;
create trigger food_image_patrol_rules_set_updated_at
  before update on public.food_image_patrol_rules
  for each row execute function public.set_updated_at();

do $$
begin
  revoke all on public.food_image_patrol_rules from public, anon, authenticated;
  alter table public.food_image_patrol_rules enable row level security;
  drop policy if exists "food_image_patrol_rules: server only" on public.food_image_patrol_rules;
  create policy "food_image_patrol_rules: server only"
    on public.food_image_patrol_rules for all to public using (false) with check (false);
end $$;

comment on table public.food_image_patrol_rules is
  'Admin-configured category watches for automatic image batch creation under the daily Hunyuan quota';
