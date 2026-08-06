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
  check (reviewed_count <= candidate_count),
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.food_image_audit_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.food_image_audit_runs(id) on delete cascade,
  food_id uuid references public.foods(id) on delete restrict,
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
  check (
    (status = 'regeneration_requested'
      and operator_decision is not distinct from 'regenerate'
      and regeneration_job_id is not null)
    or (status = 'kept'
      and operator_decision is not distinct from 'keep'
      and regeneration_job_id is null)
    or (status not in ('regeneration_requested','kept')
      and operator_decision is null
      and regeneration_job_id is null)
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (run_id, old_image_id)
);

create or replace function public.validate_food_image_audit_item_old_image()
returns trigger
language plpgsql
as $$
begin
  -- food_id is nullable only for the controlled food-delete history path.
  if new.food_id is null then
    if tg_op = 'INSERT' then
      raise exception 'food_image_audit_items.food_id is required when creating an audit item'
        using errcode = '23514';
    end if;

    if current_setting('app.food_image_audit_preserve_history', true) is distinct from 'on'
      or old.food_id is null
      or new.old_image_id is distinct from old.old_image_id
      or new.image_url is distinct from old.image_url
      or new.prompt_plan_json is distinct from old.prompt_plan_json then
      raise exception 'food_image_audit_items.food_id may only be nulled by the controlled food deletion path'
        using errcode = '23514';
    end if;

    return new;
  end if;

  if not exists (
    select 1
    from public.food_images image
    where image.id = new.old_image_id
      and image.food_id = new.food_id
      and image.is_primary
      and image.status = 'ready'
      and (image.review_status is null or image.review_status = 'approved')
  ) then
    raise exception 'food_image_audit_items.old_image_id must reference a ready approved primary image for the same food'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists food_image_audit_items_validate_old_image on public.food_image_audit_items;
create trigger food_image_audit_items_validate_old_image
  before insert or update of food_id, old_image_id on public.food_image_audit_items
  for each row execute function public.validate_food_image_audit_item_old_image();

create or replace function public.prevent_food_image_audit_item_snapshot_mutation()
returns trigger
language plpgsql
as $$
begin
  if new.old_image_id is distinct from old.old_image_id
    or new.image_url is distinct from old.image_url
    or new.visual_type is distinct from old.visual_type
    or new.decision_source is distinct from old.decision_source
    or new.matched_keywords is distinct from old.matched_keywords
    or new.risk_reasons is distinct from old.risk_reasons
    or new.prompt_plan_json is distinct from old.prompt_plan_json then
    raise exception 'food_image_audit_items snapshots are immutable after creation'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists food_image_audit_items_prevent_snapshot_mutation on public.food_image_audit_items;
create trigger food_image_audit_items_prevent_snapshot_mutation
  before update of old_image_id, image_url, visual_type, decision_source, matched_keywords, risk_reasons, prompt_plan_json
  on public.food_image_audit_items
  for each row execute function public.prevent_food_image_audit_item_snapshot_mutation();

create or replace function public.preserve_food_image_audit_history_before_food_delete()
returns trigger
language plpgsql
as $$
begin
  -- Restrict arbitrary food_id NULL writes. This transaction-local flag is set
  -- only while deleting the parent food and cleared immediately afterward.
  perform set_config('app.food_image_audit_preserve_history', 'on', true);
  update public.food_image_audit_items
  set food_id = null
  where food_id = old.id;
  perform set_config('app.food_image_audit_preserve_history', 'off', true);
  return old;
end;
$$;

drop trigger if exists food_image_audit_history_before_food_delete on public.foods;
create trigger food_image_audit_history_before_food_delete
  before delete on public.foods
  for each row execute function public.preserve_food_image_audit_history_before_food_delete();

create or replace function public.validate_food_image_audit_item_regeneration_job()
returns trigger
language plpgsql
as $regeneration_job$
begin
  -- A deleted job uses ON DELETE SET NULL. Retain that historical audit record,
  -- while every live non-null job reference must be this food's regenerate job.
  if new.regeneration_job_id is null or new.food_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from public.food_image_jobs job
    where job.id = new.regeneration_job_id
      and job.food_id = new.food_id
      and job.job_type = 'regenerate'
  ) then
    raise exception $$food_image_audit_items.regeneration_job_id must reference the same food's regenerate job$$
      using errcode = '23514';
  end if;

  return new;
end;
$regeneration_job$;

drop trigger if exists food_image_audit_items_validate_regeneration_job on public.food_image_audit_items;
create trigger food_image_audit_items_validate_regeneration_job
  before insert or update of food_id, regeneration_job_id on public.food_image_audit_items
  for each row execute function public.validate_food_image_audit_item_regeneration_job();

create or replace function public.preserve_food_image_audit_job_history_before_delete()
returns trigger
language plpgsql
as $$
begin
  -- Keep the audit snapshot valid before the FK's ON DELETE SET NULL action.
  update public.food_image_audit_items
  set status = 'needs_review',
      regeneration_job_id = null,
      operator_decision = null
  where regeneration_job_id = old.id
    and status = 'regeneration_requested';
  return old;
end;
$$;

drop trigger if exists food_image_audit_job_history_before_delete on public.food_image_jobs;
create trigger food_image_audit_job_history_before_delete
  before delete on public.food_image_jobs
  for each row execute function public.preserve_food_image_audit_job_history_before_delete();

create index if not exists food_image_audit_runs_status_created_idx
  on public.food_image_audit_runs (status, created_at desc);
create index if not exists food_image_audit_items_run_status_idx
  on public.food_image_audit_items (run_id, status);
create index if not exists food_image_audit_items_food_created_idx
  on public.food_image_audit_items (food_id, created_at desc);
create index if not exists food_image_audit_items_old_image_idx
  on public.food_image_audit_items (old_image_id);

comment on column public.food_image_audit_runs.candidate_count is
  'Cached service-maintained audit candidate summary; intentionally not maintained by a row-count trigger.';
comment on column public.food_image_audit_runs.reviewed_count is
  'Cached service-maintained audit reviewed summary; intentionally not maintained by a row-count trigger.';

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
