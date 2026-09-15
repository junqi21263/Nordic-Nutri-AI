-- Delivery receipts distinguish FCM acceptance from Android receipt/display/open events.
create table if not exists public.push_delivery_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  token_id uuid references public.device_push_tokens(id) on delete set null,
  token_hash text not null check (char_length(token_hash) = 64),
  trace_id text,
  meal_type text not null check (meal_type in ('breakfast', 'lunch', 'dinner')),
  status text not null check (status in ('pending', 'accepted', 'received', 'displayed', 'opened', 'invalidated', 'failed', 'timeout')),
  fcm_message_id text,
  last_event text,
  last_event_at timestamptz,
  accepted_at timestamptz,
  received_at timestamptz,
  displayed_at timestamptz,
  opened_at timestamptz,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '60 seconds')
);

create index if not exists push_delivery_attempts_lookup on public.push_delivery_attempts (id, user_id);
create index if not exists push_delivery_attempts_trace on public.push_delivery_attempts (trace_id, created_at desc);

alter table public.push_delivery_attempts enable row level security;
revoke all on public.push_delivery_attempts from anon, authenticated;
grant all on public.push_delivery_attempts to service_role;

-- Rollback (manual): drop the indexes and table after delivery receipt support is disabled.
