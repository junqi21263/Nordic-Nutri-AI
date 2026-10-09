-- Device push tokens are server-managed for the DEV and production Android package IDs.
create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  token text not null check (char_length(btrim(token)) between 1 and 4096),
  platform text not null check (platform = 'android'),
  package_name text not null,
  environment text not null check (char_length(btrim(environment)) between 1 and 128),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  invalidated_at timestamptz,
  unique (token)
);

alter table public.device_push_tokens
  drop constraint if exists device_push_tokens_package_name_check;
alter table public.device_push_tokens
  add constraint device_push_tokens_package_name_check
  check (package_name in ('com.lewislee.nordicnutri.dev', 'com.lewislee.nordicnutri'));

create index if not exists device_push_tokens_owner_active
  on public.device_push_tokens (user_id, updated_at desc)
  where invalidated_at is null;

alter table public.device_push_tokens enable row level security;
revoke all on public.device_push_tokens from public, anon, authenticated;
grant all on public.device_push_tokens to service_role;
