-- Historical image audit records are server-only. They snapshot the old image
-- and expected prompt plan; they never promote, replace, or update food_images.

create table if not exists public.food_image_audit_runs (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'high_risk_processed'
    check (scope = 'high_risk_processed'),
  status text not null default 'previewed'
    check (status in ('previewed','reviewing','completed','completed_with_errors')),
  requested_count integer not null
    check (requested_count between 1 and 100),
  candidate_count integer not null default 0
    check (candidate_count >= 0),
  reviewed_count integer not null default 0
    check (reviewed_count >= 0),
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.food_image_audit_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.food_image_audit_runs(id) on delete cascade,
  food_id uuid not null references public.foods(id) on delete cascade,
  old_image_id uuid not null references public.food_images(id) on delete restrict,
  regeneration_job_id uuid references public.food_image_jobs(id) on delete set null,
  image_url text not null
    check (char_length(image_url) <= 2048),
  visual_type text not null
    check (visual_type in (
      'raw_meat','processed_meat','whole_fish','fish_fillet','shellfish','egg',
      'dairy_liquid','dairy_solid','tofu_soy','grain','flour_powder','bread_baked',
      'root_tuber','leafy_vegetable','whole_vegetable','whole_fruit','cut_fruit',
      'nuts_seeds','oil_liquid','condiment_liquid','sauce_paste','dry_spice',
      'beverage_liquid','drink_powder','coffee_powder','tea_leaf','alcohol_bottle',
      'non_alcohol_wine','canned_food','packaged_snack','prepared_dish','unknown'
    )),
  decision_source text not null
    check (decision_source in ('manual','tags','nameZh','nameEn','category','fallback')),
  matched_keywords jsonb not null default '[]'::jsonb
    check (jsonb_typeof(matched_keywords) = 'array'),
  risk_reasons jsonb not null default '[]'::jsonb
    check (jsonb_typeof(risk_reasons) = 'array'),
  prompt_plan_json jsonb not null,
  ai_result_json jsonb,
  ai_confidence numeric(4, 3)
    check (ai_confidence is null or ai_confidence between 0 and 1),
  status text not null default 'pending_review'
    check (status in ('pending_review','ai_pass','needs_review','failed','kept','regeneration_requested')),
  operator_decision text
    check (operator_decision is null or operator_decision in ('keep','regenerate')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, old_image_id)
);

create index if not exists food_image_audit_runs_status_created_idx
  on public.food_image_audit_runs (status, created_at desc);
create index if not exists food_image_audit_items_run_status_idx
  on public.food_image_audit_items (run_id, status);
create index if not exists food_image_audit_items_food_created_idx
  on public.food_image_audit_items (food_id, created_at desc);
create index if not exists food_image_audit_items_old_image_idx
  on public.food_image_audit_items (old_image_id);

drop trigger if exists food_image_audit_runs_set_updated_at on public.food_image_audit_runs;
create trigger food_image_audit_runs_set_updated_at
  before update on public.food_image_audit_runs
  for each row execute function public.set_updated_at();

drop trigger if exists food_image_audit_items_set_updated_at on public.food_image_audit_items;
create trigger food_image_audit_items_set_updated_at
  before update on public.food_image_audit_items
  for each row execute function public.set_updated_at();

revoke all on public.food_image_audit_runs from public, anon, authenticated;
revoke all on public.food_image_audit_items from public, anon, authenticated;

alter table public.food_image_audit_runs enable row level security;
alter table public.food_image_audit_items enable row level security;

drop policy if exists "food_image_audit_runs: server only" on public.food_image_audit_runs;
create policy "food_image_audit_runs: server only"
  on public.food_image_audit_runs for all to public using (false) with check (false);

drop policy if exists "food_image_audit_items: server only" on public.food_image_audit_items;
create policy "food_image_audit_items: server only"
  on public.food_image_audit_items for all to public using (false) with check (false);

comment on table public.food_image_audit_runs is
  'Server-only historical food-image audit runs; audit never updates or replaces primary images.';
comment on table public.food_image_audit_items is
  'Server-only historical image audit snapshots; regeneration creates a candidate job only.';
