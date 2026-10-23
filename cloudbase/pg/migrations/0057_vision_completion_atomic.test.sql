-- DEV integration check. All fixture writes are rolled back by the caught
-- sentinel exception, including on a successful assertion run.
do $$
declare
  v_id uuid := gen_random_uuid();
  v_request uuid := gen_random_uuid();
  v_user uuid;
  v_response jsonb := '{"mealName":"fixture","items":[{"name":"rice","quantityG":100}],"providerAttempt":2}'::jsonb;
  v_count integer;
begin
  select user_id into strict v_user from public.ai_analysis limit 1;
  begin
    insert into public.ai_analysis(id,user_id,client_request_id,provider,model,status,execution_owner,quota_state)
    values(v_id,v_user,v_request,'qwen','fixture','analyzing','async','reserved');
    insert into private.vision_quota_reservations(user_id,client_request_id,analysis_id,expires_at,reservation_expires_at)
    values(v_user,v_request,v_id,now()+interval '5 minutes',now()+interval '5 minutes');
    begin
      perform public.complete_vision_analysis(v_id,0,'{"items":[]}'::jsonb);
      raise exception 'empty result unexpectedly completed';
    exception when raise_exception then
      if sqlerrm <> 'VISION_RESULT_INVALID' then raise; end if;
    end;
    if not exists(select 1 from public.ai_analysis where id=v_id and status='analyzing' and version=0) then
      raise exception 'invalid result changed job';
    end if;
    select count(*) into v_count from public.complete_vision_analysis(v_id,0,v_response) where accepted;
    if v_count <> 1 then raise exception 'completion rejected'; end if;
    if not exists(select 1 from public.ai_analysis where id=v_id and status='completed' and quota_state='committed' and version=1 and provider_attempt=2) then
      raise exception 'result and quota are not committed together';
    end if;
    if not exists(select 1 from private.vision_quota_reservations where analysis_id=v_id and state='committed' and response=v_response) then
      raise exception 'reservation not committed';
    end if;
    select count(*) into v_count from public.complete_vision_analysis(v_id,0,v_response);
    if v_count <> 0 then raise exception 'stale completion accepted'; end if;
    raise exception using errcode='ZT001', message='rollback successful fixture';
  exception when sqlstate 'ZT001' then null;
  end;
  if exists(select 1 from public.ai_analysis where id=v_id)
     or exists(select 1 from private.vision_quota_reservations where analysis_id=v_id) then
    raise exception 'fixture rollback failed';
  end if;
end;
$$;
