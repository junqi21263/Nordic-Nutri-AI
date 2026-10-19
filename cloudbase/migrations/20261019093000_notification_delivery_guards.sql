-- Keep outbox status accurate when a message is read before it is sent.
create or replace function public.mark_notification_read(p_id uuid,p_user uuid) returns boolean language plpgsql security definer set search_path=public as $$
declare f uuid;
begin
 update public.user_notifications set read_at=coalesce(read_at,now()),push_status=case when push_status='pending' then 'skipped' else push_status end where id=p_id and user_id=p_user and withdrawn_at is null returning feedback_id into f;
 if not found then return false; end if;
 if f is not null then update public.user_feedback set reply_read_at=now() where id=f and user_id=p_user; end if;
 return true;
end $$;
create or replace function public.claim_notification_pushes(p_limit integer default 10) returns setof public.user_notifications language plpgsql security definer set search_path=public as $$
begin
 update public.user_notifications set push_status='skipped' where push_status='pending' and (withdrawn_at is not null or read_at is not null);
 update public.user_notifications set push_status='failed',push_error='WORKER_LEASE_EXPIRED' where push_status='sending' and next_attempt_at<=now() and push_attempts>=3;
 return query update public.user_notifications set push_status='sending',push_attempts=push_attempts+1,next_attempt_at=now()+interval '5 minutes'
 where id in (select id from public.user_notifications where withdrawn_at is null and read_at is null and push_attempts<3 and ((push_status='pending' and next_attempt_at<=now()) or (push_status='sending' and next_attempt_at<=now())) order by created_at for update skip locked limit least(greatest(p_limit,1),20)) returning *;
end $$;
create function public.notification_announcement_stats(p_id uuid) returns jsonb language sql security definer set search_path=public as $$
 select jsonb_build_object('recipients',count(*),'read',count(*) filter(where n.read_at is not null),
 'pending',count(*) filter(where n.push_status='pending'),'sending',count(*) filter(where n.push_status='sending'),
 'accepted',count(*) filter(where n.push_status='accepted'),'skipped',count(*) filter(where n.push_status='skipped'),'failed',count(*) filter(where n.push_status='failed'),
 'received',count(*) filter(where d.received),'displayed',count(*) filter(where d.displayed),'opened',count(*) filter(where d.opened))
 from public.user_notifications n left join (select notification_id,bool_or(received_at is not null) received,bool_or(displayed_at is not null) displayed,bool_or(opened_at is not null) opened from public.push_delivery_attempts group by notification_id) d on d.notification_id=n.id where n.announcement_id=p_id;
$$;
revoke all on function public.notification_announcement_stats(uuid) from public,anon,authenticated;
grant execute on function public.notification_announcement_stats(uuid) to service_role;
