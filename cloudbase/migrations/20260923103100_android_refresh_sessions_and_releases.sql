-- Android rotating refresh sessions and release metadata. Server-only tables.

create table if not exists public.auth_refresh_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users(id) on delete cascade,
  token_hash char(64) not null unique,
  token_version integer not null check (token_version >= 1),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  replaced_by uuid references public.auth_refresh_sessions(id),
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists auth_refresh_sessions_live_user_idx
  on public.auth_refresh_sessions (user_id, expires_at desc)
  where revoked_at is null;

alter table public.auth_refresh_sessions enable row level security;
revoke all on public.auth_refresh_sessions from public, anon, authenticated;

create or replace function public.rotate_auth_refresh_session(
  p_old_token_hash text,
  p_new_token_hash text,
  p_user_id uuid,
  p_token_version integer,
  p_new_expires_at timestamptz,
  p_now timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old_id uuid;
  v_new_id uuid;
begin
  select id
    into v_old_id
    from public.auth_refresh_sessions
   where token_hash = p_old_token_hash
     and user_id = p_user_id
     and token_version = p_token_version
     and revoked_at is null
     and expires_at > p_now
   for update;

  if v_old_id is null then
    return null;
  end if;

  insert into public.auth_refresh_sessions (
    user_id,
    token_hash,
    token_version,
    expires_at,
    last_used_at
  ) values (
    p_user_id,
    p_new_token_hash,
    p_token_version,
    p_new_expires_at,
    p_now
  ) returning id into v_new_id;

  update public.auth_refresh_sessions
     set revoked_at = p_now,
         replaced_by = v_new_id,
         last_used_at = p_now
   where id = v_old_id;

  return v_new_id;
end;
$$;

revoke all on function public.rotate_auth_refresh_session(text, text, uuid, integer, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.rotate_auth_refresh_session(text, text, uuid, integer, timestamptz, timestamptz)
  to service_role;

create table if not exists public.app_releases (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('android')),
  channel text not null check (channel in ('direct', 'market', 'all')),
  version_code integer not null check (version_code > 0),
  version_name text not null check (char_length(version_name) between 1 and 32),
  apk_url text,
  apk_sha256 char(64),
  market_url text,
  release_notes jsonb not null default '[]'::jsonb,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  published_at timestamptz,
  constraint app_releases_apk_sha256_check
    check (apk_sha256 is null or apk_sha256 ~ '^[0-9a-f]{64}$'),
  constraint app_releases_source_check
    check (apk_url is not null or market_url is not null),
  unique (platform, channel, version_code)
);

create index if not exists app_releases_enabled_lookup_idx
  on public.app_releases (platform, channel, version_code desc)
  where enabled = true;

alter table public.app_releases enable row level security;
revoke all on public.app_releases from public, anon, authenticated;

-- Rollback (manual, after disabling dependent app versions):
-- drop function if exists public.rotate_auth_refresh_session(text, text, uuid, integer, timestamptz, timestamptz);
-- drop table if exists public.app_releases;
-- drop table if exists public.auth_refresh_sessions;
