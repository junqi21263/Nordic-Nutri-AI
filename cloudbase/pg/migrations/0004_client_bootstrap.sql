-- The installed mini-program RDB client exposes PostgREST table operations,
-- not RPC. A safe empty insert bootstraps the product user from auth.uid().

alter table public.app_users
  alter column cloudbase_uid set default auth.uid()::text;

create or replace function private.create_default_product_rows()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, last_login_at)
  values (new.id, now())
  on conflict (id) do update set last_login_at = excluded.last_login_at;

  insert into public.user_settings (id)
  values (new.id)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger app_users_create_default_product_rows
after insert on public.app_users
for each row execute function private.create_default_product_rows();

grant insert on public.app_users to authenticated;

create policy "app users: create own row"
on public.app_users for insert to authenticated
with check (cloudbase_uid = auth.uid()::text);
