-- Food AI image generation: job queue, review metadata, foods image status.
-- Extends 0012 foods / food_images; adds food_image_jobs for Hunyuan batch work.

-- 1. foods: generation lifecycle fields ------------------------------------
alter table public.foods
  add column if not exists image_status text not null default 'missing'
    check (image_status in ('missing','generating','reviewing','ready','failed')),
  add column if not exists image_quality_score integer
    check (image_quality_score is null or image_quality_score between 0 and 100),
  add column if not exists recommendation_weight integer not null default 0
    check (recommendation_weight >= 0);

update public.foods
set image_status = case
  when primary_image_id is not null then 'ready'
  else coalesce(nullif(image_status, ''), 'missing')
end
where true;

create index if not exists foods_image_status_idx on public.foods (image_status);
create index if not exists foods_recommendation_weight_idx
  on public.foods (recommendation_weight desc) where is_active;

-- 2. food_images: Hunyuan / review metadata --------------------------------
-- Expand image_type / source checks by replacing constraints.
alter table public.food_images drop constraint if exists food_images_image_type_check;
alter table public.food_images
  add constraint food_images_image_type_check
  check (image_type in (
    'ingredient','prepared','packaged','dish','placeholder',
    'candidate','primary','fallback'
  ));

alter table public.food_images drop constraint if exists food_images_source_check;
alter table public.food_images
  add constraint food_images_source_check
  check (source in (
    'manual','open_food_facts','user_upload','ai_generated','licensed_stock',
    'hunyuan','upload','external','fallback'
  ));

alter table public.food_images
  add column if not exists original_file_id text
    check (original_file_id is null or char_length(original_file_id) <= 512),
  add column if not exists original_url text
    check (original_url is null or char_length(original_url) <= 2048),
  add column if not exists model_name text
    check (model_name is null or char_length(model_name) <= 128),
  add column if not exists prompt text
    check (prompt is null or char_length(prompt) <= 2000),
  add column if not exists revised_prompt text
    check (revised_prompt is null or char_length(revised_prompt) <= 2000),
  add column if not exists seed bigint,
  add column if not exists food_match_score integer
    check (food_match_score is null or food_match_score between 0 and 100),
  add column if not exists style_score integer
    check (style_score is null or style_score between 0 and 100),
  add column if not exists review_status text not null default 'pending'
    check (review_status in ('pending','approved','rejected')),
  add column if not exists reject_reason text
    check (reject_reason is null or char_length(reject_reason) <= 500),
  add column if not exists job_id uuid;

-- Align review_status with legacy status for existing rows.
update public.food_images
set review_status = case
  when status = 'ready' then 'approved'
  when status = 'rejected' then 'rejected'
  else 'pending'
end
where true;

create index if not exists food_images_review_status_idx
  on public.food_images (food_id, review_status, is_primary);

-- 3. food_image_jobs -------------------------------------------------------
create table if not exists public.food_image_jobs (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.foods(id) on delete cascade,
  job_type text not null default 'generate'
    check (job_type in ('generate','regenerate','resize')),
  status text not null default 'pending'
    check (status in (
      'pending','processing','generated','reviewing','completed','failed','cancelled'
    )),
  prompt text,
  model_name text,
  candidate_count integer not null default 3
    check (candidate_count between 1 and 6),
  generated_count integer not null default 0
    check (generated_count >= 0),
  attempt_count integer not null default 0
    check (attempt_count >= 0),
  max_attempts integer not null default 3
    check (max_attempts between 1 and 10),
  error_code text,
  error_message text,
  extra_prompt text
    check (extra_prompt is null or char_length(extra_prompt) <= 300),
  cooking_method text
    check (cooking_method is null or char_length(cooking_method) <= 40),
  serving_description text
    check (serving_description is null or char_length(serving_description) <= 80),
  started_at timestamptz,
  finished_at timestamptz,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- At most one active generate/regenerate job per food.
create unique index if not exists food_image_jobs_one_active_per_food_idx
  on public.food_image_jobs (food_id)
  where status in ('pending','processing') and job_type in ('generate','regenerate');

create index if not exists food_image_jobs_status_idx
  on public.food_image_jobs (status, created_at);
create index if not exists food_image_jobs_food_idx
  on public.food_image_jobs (food_id, created_at desc);

alter table public.food_images
  drop constraint if exists food_images_job_id_fkey;
alter table public.food_images
  add constraint food_images_job_id_fkey
  foreign key (job_id) references public.food_image_jobs(id) on delete set null;

drop trigger if exists food_image_jobs_set_updated_at on public.food_image_jobs;
create trigger food_image_jobs_set_updated_at
  before update on public.food_image_jobs
  for each row execute function public.set_updated_at();

-- 4. daily usage counter (quota guard) -------------------------------------
create table if not exists public.food_image_usage_daily (
  usage_date date primary key,
  generated_count integer not null default 0 check (generated_count >= 0),
  updated_at timestamptz not null default now()
);

-- 5. RLS: server-only ------------------------------------------------------
do $$
declare t text;
begin
  for t in (select unnest(array['food_image_jobs','food_image_usage_daily']))
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
