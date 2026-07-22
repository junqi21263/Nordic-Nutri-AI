-- Coach conversations and replies are server-only: the HTTPS function verifies
-- the product session and applies user_id filtering before every database call.
revoke all on public.coach_conversations from public, anon, authenticated;
revoke all on public.coach_messages from public, anon, authenticated;

alter table public.coach_conversations enable row level security;
alter table public.coach_messages enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'coach_conversations' and policyname = 'coach conversations: server only'
  ) then
    create policy "coach conversations: server only" on public.coach_conversations
      for all to public using (false) with check (false);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'coach_messages' and policyname = 'coach messages: server only'
  ) then
    create policy "coach messages: server only" on public.coach_messages
      for all to public using (false) with check (false);
  end if;
end
$$;
