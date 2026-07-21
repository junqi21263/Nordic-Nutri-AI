-- Native Mini Program identity mapping. Raw OpenID must never be persisted.
-- The event function supplies a keyed SHA-256 digest that is not available to
-- Mini Program callers or direct database clients.

alter table public.app_users
  add column if not exists openid_hash char(64) unique;

create index if not exists app_users_openid_hash_idx
  on public.app_users (openid_hash)
  where openid_hash is not null;
