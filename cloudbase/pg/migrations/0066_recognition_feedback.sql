create table if not exists public.recognition_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  meal_id uuid references public.meal_records(id) on delete set null,
  analysis_id uuid references public.ai_analysis(id) on delete set null,
  feedback_type text not null check (feedback_type in ('wrong_food', 'missing_food', 'extra_food', 'portion_inaccurate', 'nutrition_data', 'other')),
  original_result jsonb not null,
  corrected_result jsonb,
  model text,
  model_version text,
  image_sha256 char(64) check (image_sha256 is null or image_sha256 ~ '^[0-9a-fA-F]{64}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recognition_feedback_user_created_idx
  on public.recognition_feedback(user_id, created_at desc);

alter table public.recognition_feedback enable row level security;
drop policy if exists "recognition feedback: server only" on public.recognition_feedback;
create policy "recognition feedback: server only"
  on public.recognition_feedback
  for all to public
  using (false)
  with check (false);
revoke all on public.recognition_feedback from public, anon, authenticated;
grant all on public.recognition_feedback to service_role;
