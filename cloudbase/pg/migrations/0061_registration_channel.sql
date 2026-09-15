-- Preserve signup attribution separately from the client platform.

alter table public.app_users
  add column if not exists registration_channel text;

update public.app_users
   set registration_channel = case
     when google_sub is not null then 'google'
     when phone_e164 is not null then 'phone'
     when email_normalized is not null then 'email'
     else 'wechat'
   end
 where registration_channel is null;

alter table public.app_users
  alter column registration_channel set default 'wechat',
  alter column registration_channel set not null;

alter table public.app_users
  drop constraint if exists app_users_registration_channel_check;

alter table public.app_users
  add constraint app_users_registration_channel_check
    check (registration_channel in ('wechat', 'email', 'phone', 'google'));

create index if not exists app_users_registration_channel_created_at_idx
  on public.app_users (registration_channel, created_at desc);

-- Rollback (manual): drop the index and constraint, then drop registration_channel.
