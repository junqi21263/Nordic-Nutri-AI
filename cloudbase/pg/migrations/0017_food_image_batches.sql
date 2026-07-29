-- Batch orchestration for the food-image pipeline. All rows remain server-only;
-- the HTTP function enforces administrator access before reading or mutating.

create table if not exists public.food_image_batches (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  status text not null default 'draft'
    check (status in ('draft','running','paused','completed','completed_with_errors','cancelled')),
  selection_json jsonb not null default '{}'::jsonb,
  candidate_count integer not null default 1 check (candidate_count = 1),
  max_attempts integer not null default 3 check (max_attempts between 1 and 3),
  concurrency integer not null default 2 check (concurrency between 1 and 5),
  total_count integer not null default 0 check (total_count >= 0),
  pending_count integer not null default 0 check (pending_count >= 0),
  generating_count integer not null default 0 check (generating_count >= 0),
  review_count integer not null default 0 check (review_count >= 0),
  retry_count integer not null default 0 check (retry_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  completed_count integer not null default 0 check (completed_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  estimated_quota integer not null default 0 check (estimated_quota >= 0),
  consumed_quota integer not null default 0 check (consumed_quota >= 0),
  created_by uuid references public.app_users(id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.food_image_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.food_image_batches(id) on delete cascade,
  food_id uuid not null references public.foods(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','generating','needs_retry','needs_review','completed','failed','skipped')),
  job_id uuid references public.food_image_jobs(id) on delete set null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_image_id uuid references public.food_images(id) on delete set null,
  prompt_plan_json jsonb,
  error_code text,
  error_message text,
  locked_at timestamptz,
  locked_by text,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, food_id)
);

create unique index if not exists food_image_batch_items_one_active_food_idx
  on public.food_image_batch_items (food_id)
  where status in ('pending','generating','needs_retry');
create index if not exists food_image_batch_items_batch_status_idx
  on public.food_image_batch_items (batch_id, status, next_retry_at);
create index if not exists food_image_batch_items_batch_updated_idx
  on public.food_image_batch_items (batch_id, updated_at desc);
create index if not exists food_image_batch_items_food_idx
  on public.food_image_batch_items (food_id, created_at desc);

drop trigger if exists food_image_batches_set_updated_at on public.food_image_batches;
create trigger food_image_batches_set_updated_at
  before update on public.food_image_batches
  for each row execute function public.set_updated_at();
drop trigger if exists food_image_batch_items_set_updated_at on public.food_image_batch_items;
create trigger food_image_batch_items_set_updated_at
  before update on public.food_image_batch_items
  for each row execute function public.set_updated_at();

do $$
declare t text;
begin
  for t in (select unnest(array['food_image_batches','food_image_batch_items']))
  loop
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%1$s: server only" on public.%1$s', t);
    execute format(
      'create policy "%1$s: server only" on public.%1$s for all to public using (false) with check (false)',
      t
    );
  end loop;
end $$;
