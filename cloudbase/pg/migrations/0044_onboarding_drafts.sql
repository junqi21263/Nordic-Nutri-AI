-- Unfinished onboarding only. Completed onboarding clears this server-owned draft.
create table if not exists public.onboarding_drafts (
  user_id uuid primary key references public.app_users(id) on delete cascade,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

revoke all on public.onboarding_drafts from public, anon, authenticated;
alter table public.onboarding_drafts enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'onboarding_drafts' and policyname = 'onboarding drafts: server only'
  ) then
    create policy "onboarding drafts: server only" on public.onboarding_drafts
      for all to public using (false) with check (false);
  end if;
end
$$;
