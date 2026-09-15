-- Android FCM registrations are server-managed device credentials.
create table public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  token text not null check (char_length(btrim(token)) between 1 and 4096),
  platform text not null check (platform = 'android'),
  package_name text not null check (package_name = 'com.lewislee.nordicnutri.dev'),
  environment text not null check (char_length(btrim(environment)) between 1 and 128),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  invalidated_at timestamptz,
  unique (token)
);

create index device_push_tokens_owner_active
  on public.device_push_tokens (user_id, updated_at desc)
  where invalidated_at is null;

alter table public.device_push_tokens enable row level security;
revoke all on public.device_push_tokens from anon, authenticated;
grant all on public.device_push_tokens to service_role;

-- Rollback (manual): drop the index and table after disabling server push.
