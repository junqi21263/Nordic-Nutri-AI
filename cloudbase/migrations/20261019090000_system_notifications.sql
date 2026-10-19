-- Backend-only message center; identity is derived from authenticated application sessions.
create table public.system_announcements (
 id uuid primary key default gen_random_uuid(), title text not null check(length(title) between 1 and 80),
 summary text not null check(length(summary) between 1 and 200), body text not null check(length(body) between 1 and 10000),
 status text not null default 'draft' check(status in ('draft','published','retracted')),
 audience text not null default 'all' check(audience in ('all','selected')),
 recipient_ids uuid[] not null default '{}', push_enabled boolean not null default false,
 created_by text not null, updated_by text not null, published_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.notification_preferences (
 user_id uuid primary key references public.app_users(id) on delete cascade,
 system_push boolean not null default true, feedback_push boolean not null default true
);
create table public.user_notifications (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id) on delete cascade,
 kind text not null check(kind in ('system','feedback')), title text not null, body text not null,
 announcement_id uuid references public.system_announcements(id) on delete cascade,
 feedback_id uuid references public.user_feedback(id) on delete cascade,
 read_at timestamptz, withdrawn_at timestamptz,
 push_status text not null default 'skipped' check(push_status in ('pending','sending','accepted','skipped','failed')),
 push_generation integer not null default 0, push_attempts integer not null default 0, push_error text, next_attempt_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 unique(user_id,announcement_id), unique(user_id,feedback_id),
 check ((kind='system' and announcement_id is not null and feedback_id is null) or (kind='feedback' and feedback_id is not null and announcement_id is null))
);
create index user_notifications_inbox on public.user_notifications(user_id,created_at desc) where withdrawn_at is null;
create index user_notifications_queue on public.user_notifications(next_attempt_at) where push_status in ('pending','sending');
alter table public.push_delivery_attempts drop constraint push_delivery_attempts_meal_type_check;
alter table public.push_delivery_attempts add constraint push_delivery_attempts_meal_type_check check(meal_type in ('breakfast','lunch','dinner','message'));
alter table public.push_delivery_attempts add column notification_id uuid references public.user_notifications(id) on delete set null;
create index push_delivery_notification on public.push_delivery_attempts(notification_id);

-- Publishing locks the draft, snapshots recipients and creates the durable outbox atomically.
create function public.publish_system_announcement(p_id uuid,p_actor text,p_action text) returns jsonb language plpgsql security definer set search_path=public as $$
declare a public.system_announcements; n integer;
begin
 select * into a from public.system_announcements where id=p_id for update;
 if not found then raise exception 'ANNOUNCEMENT_NOT_FOUND'; end if;
 if p_action='retract' then
  update public.system_announcements set status='retracted',updated_by=p_actor,updated_at=now() where id=p_id;
  update public.user_notifications set withdrawn_at=now(),push_status=case when push_status in ('pending','sending') then 'skipped' else push_status end where announcement_id=p_id;
 elsif p_action='publish' and a.status='draft' then
  if a.audience='selected' and (cardinality(a.recipient_ids)=0 or exists(select 1 from unnest(a.recipient_ids) r where not exists(select 1 from public.app_users u where u.id=r and u.status<>'deleted'))) then raise exception 'ANNOUNCEMENT_RECIPIENT_INVALID'; end if;
  insert into public.user_notifications(user_id,kind,title,body,announcement_id,push_status)
   select u.id,'system',a.title,a.summary,a.id,case when a.push_enabled then 'pending' else 'skipped' end from public.app_users u where u.status<>'deleted' and (a.audience='all' or u.id=any(a.recipient_ids)) on conflict(user_id,announcement_id) do nothing;
  update public.system_announcements set status='published',published_at=now(),updated_by=p_actor,updated_at=now() where id=p_id;
 elsif p_action='remind' and a.status='published' then
  update public.user_notifications set push_status='pending',push_generation=push_generation+1,push_attempts=0,push_error=null,next_attempt_at=now() where announcement_id=p_id and withdrawn_at is null and read_at is null and push_status<>'sending';
 elsif not (p_action='publish' and a.status='published') then raise exception 'ANNOUNCEMENT_STATE_INVALID';
 end if;
 select count(*) into n from public.user_notifications where announcement_id=p_id;
 return jsonb_build_object('id',p_id,'recipients',n);
end $$;

create function public.sync_announcement_content() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if old.status<>'draft' and (new.audience<>old.audience or new.recipient_ids<>old.recipient_ids) then raise exception 'ANNOUNCEMENT_AUDIENCE_LOCKED'; end if;
 update public.user_notifications set title=new.title,body=new.summary where announcement_id=new.id;
 return new;
end $$;
create trigger announcement_content_updated after update of title,summary,body,audience,recipient_ids on public.system_announcements for each row execute function public.sync_announcement_content();

create function public.notify_feedback_reply() returns trigger language plpgsql security definer set search_path=public as $$
begin
 if new.admin_reply is not null and new.admin_reply is distinct from old.admin_reply then
  insert into public.user_notifications(user_id,kind,title,body,feedback_id,push_status)
   values(new.user_id,'feedback','你的反馈有新回复','Nordic 已回复你提交的问题，点此查看。',new.id,'pending')
   on conflict(user_id,feedback_id) do update set read_at=null,created_at=now();
 elsif new.reply_read_at is not null and new.reply_read_at is distinct from old.reply_read_at then
  update public.user_notifications set read_at=new.reply_read_at where feedback_id=new.id and user_id=new.user_id;
 end if;
 return new;
end $$;
create trigger feedback_reply_notification after update of admin_reply,reply_read_at on public.user_feedback for each row execute function public.notify_feedback_reply();

create function public.mark_notification_read(p_id uuid,p_user uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare f uuid;
begin
 update public.user_notifications set read_at=coalesce(read_at,now()) where id=p_id and user_id=p_user and withdrawn_at is null returning feedback_id into f;
 if not found then return false; end if;
 if f is not null then update public.user_feedback set reply_read_at=now() where id=f and user_id=p_user; end if;
 return true;
end $$;

create function public.claim_notification_pushes(p_limit integer default 10) returns setof public.user_notifications language plpgsql security definer set search_path=public as $$
begin
 update public.user_notifications set push_status='failed',push_error='WORKER_LEASE_EXPIRED' where push_status='sending' and next_attempt_at<=now() and push_attempts>=3;
 return query update public.user_notifications set push_status='sending',push_attempts=push_attempts+1,next_attempt_at=now()+interval '5 minutes'
 where id in (select id from public.user_notifications where withdrawn_at is null and read_at is null and push_attempts<3 and ((push_status='pending' and next_attempt_at<=now()) or (push_status='sending' and next_attempt_at<=now())) order by created_at for update skip locked limit least(greatest(p_limit,1),20)) returning *;
end $$;

alter table public.system_announcements enable row level security;
alter table public.user_notifications enable row level security;
alter table public.notification_preferences enable row level security;
revoke all on public.system_announcements,public.user_notifications,public.notification_preferences from anon,authenticated;
grant all on public.system_announcements,public.user_notifications,public.notification_preferences to service_role;
revoke all on function public.publish_system_announcement(uuid,text,text),public.sync_announcement_content(),public.notify_feedback_reply(),public.mark_notification_read(uuid,uuid),public.claim_notification_pushes(integer) from public,anon,authenticated;
grant execute on function public.publish_system_announcement(uuid,text,text),public.mark_notification_read(uuid,uuid),public.claim_notification_pushes(integer) to service_role;
-- Rollback: disable new notification API/worker before dropping functions, triggers and tables. No historical feedback is backfilled.
