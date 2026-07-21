-- Authenticated product feedback. Only the HTTPS function writes this table.
create table if not exists public.user_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  category text not null default 'product' check (category in ('product', 'bug', 'feature', 'support')),
  content text not null check (char_length(btrim(content)) between 1 and 2000),
  status text not null default 'new' check (status in ('new', 'reviewing', 'resolved', 'closed')),
  client_request_id uuid not null,
  device_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, client_request_id)
);

create index if not exists user_feedback_user_created_at_idx on public.user_feedback (user_id, created_at desc);
drop trigger if exists user_feedback_set_updated_at on public.user_feedback;
create trigger user_feedback_set_updated_at before update on public.user_feedback
for each row execute function public.set_updated_at();

revoke all on public.user_feedback from public, anon, authenticated;
alter table public.user_feedback enable row level security;

-- These tables are server-only. The explicit deny policies document and enforce
-- that no browser/mini-program database role may bypass the HTTPS function.
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_feedback' and policyname = 'feedback: server only'
  ) then
    create policy "feedback: server only" on public.user_feedback
      for all to public using (false) with check (false);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_analysis' and policyname = 'ai analysis: server only'
  ) then
    create policy "ai analysis: server only" on public.ai_analysis
      for all to public using (false) with check (false);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'meal_records' and policyname = 'meal records: server only'
  ) then
    create policy "meal records: server only" on public.meal_records
      for all to public using (false) with check (false);
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'meal_items' and policyname = 'meal items: server only'
  ) then
    create policy "meal items: server only" on public.meal_items
      for all to public using (false) with check (false);
  end if;
end
$$;
