-- Create the existing coach schema when a legacy environment was created
-- without 0001_core_schema.sql. Every statement is safe to run repeatedly.
create table if not exists public.coach_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  title text not null default '营养教练' check (char_length(btrim(title)) between 1 and 100),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.coach_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  conversation_id uuid references public.coach_conversations(id) on delete cascade,
  question_type text check (question_type is null or question_type in ('protein_today', 'dinner_plan', 'muscle_gain', 'fat_loss')),
  role text not null default 'user' check (role in ('user', 'assistant', 'system')),
  content text,
  context_date date not null default current_date,
  context_snapshot jsonb,
  answer jsonb,
  provider text check (provider is null or char_length(btrim(provider)) between 1 and 80),
  model text check (model is null or char_length(btrim(model)) between 1 and 120),
  client_request_id uuid,
  created_at timestamptz not null default now(),
  unique (user_id, client_request_id)
);

create index if not exists coach_messages_user_context_date_idx
  on public.coach_messages (user_id, context_date desc);

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
