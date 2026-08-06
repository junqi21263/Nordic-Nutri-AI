-- User-visible feedback replies remain server-owned through the HTTPS function.

alter table public.user_feedback
  add column if not exists admin_reply text,
  add column if not exists replied_at timestamptz,
  add column if not exists reply_read_at timestamptz;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'user_feedback_admin_reply_length_check'
      and conrelid = 'public.user_feedback'::regclass
  ) then
    alter table public.user_feedback
      add constraint user_feedback_admin_reply_length_check
      check (admin_reply is null or char_length(btrim(admin_reply)) between 1 and 2000);
  end if;
end
$$;

create index if not exists user_feedback_user_reply_unread_idx
on public.user_feedback (user_id, replied_at desc)
where admin_reply is not null and reply_read_at is null;

revoke all on public.user_feedback from public, anon, authenticated;
alter table public.user_feedback enable row level security;
