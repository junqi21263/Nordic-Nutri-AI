-- Incremental report quality, persistent first activation, and duration histograms.
create table public.analytics_actor_activation (
 environment text not null,actor_key text not null,consent_revision uuid not null references public.analytics_consent_records on delete cascade,
 first_active_day date not null,is_test boolean not null,primary key(environment,actor_key,consent_revision)
);
alter table public.analytics_actor_activation enable row level security;
revoke all on public.analytics_actor_activation from public,anon,authenticated;
grant select,insert,update,delete on public.analytics_actor_activation to service_role;
alter table public.analytics_daily_actor_facts add column duration_histogram bigint[] not null default array_fill(0::bigint,array[15]);
insert into public.analytics_actor_activation select environment,actor_key,consent_revision,min(day),bool_or(is_test) from public.analytics_daily_actor_facts
where authenticated and event_name in ('app_foreground','auth_started','scan_opened','meal_save_clicked','nova_request_started') group by environment,actor_key,consent_revision;
create function public.analytics_hist_increment(p_hist bigint[],p_duration numeric) returns bigint[] language plpgsql immutable set search_path='' as $$
declare limits integer[]=array[50,100,200,500,1000,2000,5000,10000,20000,30000,60000,90000,180000,300000];r bigint[]=p_hist;i integer;begin
 for i in 1..14 loop if p_duration<=limits[i] then r[i]=r[i]+1;return r;end if;end loop;r[15]=r[15]+1;return r;end $$;
create function public.analytics_hist_merge(p_hists bigint[]) returns bigint[] language plpgsql immutable set search_path='' as $$
declare r bigint[]=array_fill(0::bigint,array[15]);h bigint[];i integer;begin
 if p_hists is null then return r;end if;foreach h slice 1 in array p_hists loop for i in 1..15 loop r[i]=r[i]+coalesce(h[i],0);end loop;end loop;return r;end $$;
create function public.analytics_hist_quantile(p_hist bigint[],p_q numeric) returns jsonb language plpgsql immutable set search_path='' as $$
declare limits integer[]=array[50,100,200,500,1000,2000,5000,10000,20000,30000,60000,90000,180000,300000];n bigint;running bigint=0;i integer;begin
 select sum(v) into n from unnest(p_hist)v;if coalesce(n,0)=0 then return null;end if;
 for i in 1..15 loop running=running+p_hist[i];if running>=ceil(n*p_q) then return jsonb_build_object('ms',case when i<=14 then limits[i] else null end,'overflow',i=15,'approximate',true,'samples',n);end if;end loop;return null;end $$;
create or replace function public.analytics_record_event(p_consent public.analytics_consent_records,p_event jsonb,p_source text)
returns text language plpgsql security definer set search_path='' as $$
declare t timestamptz; d date; eid uuid; claimed uuid; props jsonb; test_event boolean; begin
 eid=(p_event->>'event_id')::uuid;t=(p_event->>'occurred_at')::timestamptz;props=coalesce(p_event->'properties','{}');
 -- Validation bounds client clocks; retain the original event day for offline replay.
 if p_source='client' and (t<now()-interval '72 hours' or t>now()+interval '10 minutes') then raise exception 'ANALYTICS_TIMESTAMP_INVALID';end if;
 d=(t at time zone 'Asia/Shanghai')::date;test_event=p_consent.is_test;
 insert into public.analytics_ingest_receipts(environment,event_id,consent_revision,session_id)
 values(p_consent.environment,eid,p_consent.consent_revision,(p_event->>'session_id')::uuid)
 on conflict do nothing returning event_id into claimed;
 if claimed is null then return 'duplicate';end if;
 insert into public.analytics_events(event_id,consent_revision,environment,actor_key,authenticated,anonymous_id,session_id,event_name,
 platform,app_version,build_code,page_key,operation_id,attempt_id,trace_id,properties,source,diagnostic,occurred_at,effective_at,timestamp_quality,is_test)
 values(eid,p_consent.consent_revision,p_consent.environment,p_consent.actor_key,p_consent.user_id is not null,p_consent.anonymous_id,
 (p_event->>'session_id')::uuid,p_event->>'event_name',p_consent.platform,coalesce(p_event->>'app_version','unknown'),
 (p_event->>'build_code')::integer,coalesce(p_event->>'page_key','unknown'),(p_event->>'operation_id')::uuid,(p_event->>'attempt_id')::uuid,p_event->>'trace_id',
 props,p_source,coalesce((p_event->>'diagnostic')::boolean,false),(p_event->>'occurred_at')::timestamptz,t,
 case when p_source='server' then 'server' else 'client_bounded' end,test_event);
 insert into public.analytics_daily_actor_facts(environment,actor_key,consent_revision,day,event_name,platform,app_version,channel,authenticated,is_test,first_at,last_at)
 values(p_consent.environment,p_consent.actor_key,p_consent.consent_revision,d,p_event->>'event_name',p_consent.platform,coalesce(p_event->>'app_version','unknown'),coalesce(props->>'channel','direct'),p_consent.user_id is not null,test_event,t,t)
 on conflict(environment,actor_key,consent_revision,day,event_name,platform,app_version,channel)
 do update set event_count=analytics_daily_actor_facts.event_count+1,last_at=greatest(analytics_daily_actor_facts.last_at,excluded.last_at),first_at=least(analytics_daily_actor_facts.first_at,excluded.first_at);
 if p_event->>'event_name' in ('app_foreground','auth_started','scan_opened','meal_save_clicked','nova_request_started') and p_consent.user_id is not null then
 insert into public.analytics_actor_activation(environment,actor_key,consent_revision,first_active_day,is_test) values(p_consent.environment,p_consent.actor_key,p_consent.consent_revision,d,test_event)
 on conflict(environment,actor_key,consent_revision) do update set first_active_day=least(analytics_actor_activation.first_active_day,excluded.first_active_day);
 end if;
 if (props->>'duration_ms') is not null or (props->>'first_chunk_ms') is not null then
 update public.analytics_daily_actor_facts set duration_histogram=public.analytics_hist_increment(duration_histogram,coalesce((props->>'duration_ms')::numeric,(props->>'first_chunk_ms')::numeric))
 where environment=p_consent.environment and actor_key=p_consent.actor_key and consent_revision=p_consent.consent_revision and day=d and event_name=p_event->>'event_name' and platform=p_consent.platform and app_version=coalesce(p_event->>'app_version','unknown') and channel=coalesce(props->>'channel','direct');
 end if;
 return 'accepted';end $$;

create or replace function public.analytics_project(p_environment text,p_limit integer default 500)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='5s' set lock_timeout='100ms' as $$
declare f record;c public.analytics_consent_records;o public.analytics_outbox;evt jsonb;n integer=0;last_watermark timestamptz;begin
 if not pg_try_advisory_xact_lock(hashtextextended('analytics-project:'||p_environment,0)) then return '{"busy":true}'::jsonb;end if;
 select watermark into last_watermark from public.analytics_projection_state where environment=p_environment;
 for f in
 with facts as (
 select 'meal_saved' event_name,m.id,m.user_id,m.created_at at_time,jsonb_build_object('entry',case when m.template_id is not null then 'template' when m.analysis_id is not null then 'scan' else 'manual' end,'is_first',not exists(select 1 from public.meal_records old where old.user_id=m.user_id and (old.created_at,old.id)<(m.created_at,m.id))) props from public.meal_records m
 union all select 'onboarding_completed',id,id,onboarding_completed_at,'{}'::jsonb from public.profiles where onboarding_completed_at is not null
 union all select 'reminder_updated',id,user_id,updated_at,jsonb_build_object('enabled_count',case when enabled then 1 else 0 end) from public.meal_reminder_schedules
 union all select 'meal_updated',id,user_id,updated_at,'{}'::jsonb from public.meal_records where updated_at>created_at and deleted_at is null
 union all select 'meal_deleted',id,user_id,deleted_at,'{}'::jsonb from public.meal_records where deleted_at is not null
 union all select 'account_registered',id,id,created_at,jsonb_build_object('method',coalesce(registration_channel,'unknown')) from public.app_users
 union all select 'auth_completed',s.id,s.user_id,s.created_at,jsonb_build_object('method','unknown') from public.auth_refresh_sessions s where not exists(select 1 from public.auth_refresh_sessions old where old.replaced_by=s.id)
 union all select 'template_saved',id,user_id,created_at,'{}'::jsonb from public.meal_templates
 union all select 'template_used',id,user_id,created_at,'{}'::jsonb from public.meal_records where template_id is not null
 union all select 'feedback_submitted',id,user_id,created_at,'{}'::jsonb from public.user_feedback
 union all select 'feedback_reply_viewed',id,user_id,reply_read_at,'{}'::jsonb from public.user_feedback where reply_read_at is not null
 union all select 'vision_started',id,user_id,created_at,'{}'::jsonb from public.ai_analysis
 union all select 'vision_terminal',id,user_id,coalesce(completed_at,updated_at),jsonb_build_object('outcome',case when status='completed' then 'succeeded' when status='cancelled' then 'cancelled' when status='expired' then 'timeout' else 'failed' end,'duration_ms',greatest(0,extract(epoch from (coalesce(completed_at,updated_at)-created_at))*1000)) from public.ai_analysis where status in ('completed','failed','expired','cancelled')
 union all select 'nova_server_terminal',id,user_id,created_at,jsonb_build_object('outcome','completed') from public.coach_messages where role='assistant'
 union all select 'notification_read',id,user_id,read_at,jsonb_build_object('notification_kind',kind) from public.user_notifications where read_at is not null
 union all select 'push_delivery_event',id,user_id,accepted_at,jsonb_build_object('stage','accepted','observation_method','provider_ack') from public.push_delivery_attempts where accepted_at is not null
 union all select 'push_delivery_event_received',id,user_id,received_at,jsonb_build_object('stage','received','observation_method','direct') from public.push_delivery_attempts where received_at is not null
 union all select 'push_delivery_event_displayed',id,user_id,displayed_at,jsonb_build_object('stage','displayed','observation_method','unknown') from public.push_delivery_attempts where displayed_at is not null
 union all select 'push_delivery_event_opened',id,user_id,opened_at,jsonb_build_object('stage','opened','observation_method','direct') from public.push_delivery_attempts where opened_at is not null
 ) select facts.* from facts where at_time>=coalesce(last_watermark-interval '72 hours',(select min(created_at) from public.analytics_consent_records where environment=p_environment))
 and exists(select 1 from public.analytics_consent_records eligible where eligible.environment=p_environment and eligible.user_id=facts.user_id and eligible.analytics and eligible.revoked_at is null and eligible.created_at<=facts.at_time and eligible.expires_at>facts.at_time)
 and not exists(select 1 from public.analytics_outbox x where x.business_key=p_environment||':'||facts.event_name||':'||facts.id::text||case when facts.event_name in ('meal_updated','reminder_updated') then ':'||facts.at_time::text else '' end)
 order by at_time,id,event_name limit least(1000,greatest(1,p_limit))
 loop
  select * into c from public.analytics_consent_records eligible where eligible.environment=p_environment and eligible.user_id=f.user_id and eligible.analytics
   and eligible.created_at<=f.at_time and eligible.revoked_at is null and eligible.expires_at>f.at_time
   order by eligible.created_at desc limit 1;
  if c.consent_revision is null then continue;end if;
  insert into public.analytics_outbox(business_key,consent_revision,event_name,fact_id,occurred_at,properties)
   values(p_environment||':'||f.event_name||':'||f.id||case when f.event_name in ('meal_updated','reminder_updated') then ':'||f.at_time::text else '' end,c.consent_revision,f.event_name,f.id,f.at_time,f.props) on conflict do nothing;
  n=n+1;
 end loop;
 for o in select x.* from public.analytics_outbox x join public.analytics_consent_records c0 using(consent_revision) where c0.environment=p_environment and x.delivered_at is null order by x.occurred_at limit least(1000,greatest(1,p_limit)) for update of x skip locked loop
  select * into c from public.analytics_consent_records where consent_revision=o.consent_revision;
  if c.revoked_at is not null then update public.analytics_outbox set delivered_at=now() where business_key=o.business_key;continue;end if;
  evt=jsonb_build_object('event_id',gen_random_uuid(),'session_id',c.anonymous_id,'event_name',case when o.event_name like 'push_delivery_event_%' then 'push_delivery_event' else o.event_name end,'occurred_at',o.occurred_at,'properties',o.properties,'app_version',coalesce((select e.app_version from public.analytics_events e where e.actor_key=c.actor_key and e.source='client' and e.occurred_at<=o.occurred_at and e.occurred_at>o.occurred_at-interval '30 days' order by e.occurred_at desc limit 1),'unknown'),'page_key','server','operation_id',o.fact_id);
  perform public.analytics_record_event(c,evt,'server');
  update public.analytics_outbox set delivered_at=now() where business_key=o.business_key;
 end loop;
 -- A cursor advances only through examined committed facts. A five-minute overlap covers commit races.
 insert into public.analytics_projection_state(environment,watermark) values(p_environment,coalesce((select max(occurred_at) from public.analytics_outbox x join public.analytics_consent_records c0 using(consent_revision) where c0.environment=p_environment),now()))
 on conflict(environment) do update set watermark=excluded.watermark,updated_at=now();
 return jsonb_build_object('projected',n,'watermark',(select watermark from public.analytics_projection_state where environment=p_environment));end $$;

create or replace function public.analytics_report(p_environment text,p_view text,p_filters jsonb)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare start_day date=(p_filters->>'from')::date;end_day date=(p_filters->>'to')::date;
 plat text=nullif(p_filters->>'platform','all');ver text=nullif(p_filters->>'version','');chan text=nullif(p_filters->>'channel','');
 incl boolean=coalesce((p_filters->>'includeTest')::boolean,false);pg integer=coalesce((p_filters->>'page')::integer,1);sz integer=coalesce((p_filters->>'pageSize')::integer,30);
 base text;qry text;summary jsonb;series jsonb;rows jsonb;total bigint;watermark timestamptz;started timestamptz;notes jsonb;begin
 if p_view not in ('overview','acquisition','funnels','retention','features','versions','errors','quality') or start_day is null or end_day is null or end_day<start_day or end_day-start_day>365 or pg<1 or pg>10000 or sz<1 or sz>100 then raise exception 'ANALYTICS_FILTER_INVALID';end if;
 select max(last_at),min(first_at) into watermark,started from public.analytics_daily_actor_facts where environment=p_environment;
 base='with filtered as (select * from public.analytics_daily_actor_facts where environment=$1 and not exists(select 1 from public.analytics_consent_records c join public.app_users u on u.id=c.user_id where c.consent_revision=analytics_daily_actor_facts.consent_revision and u.status<>''active'') and day between $2 and $3 and ($4 is null or platform=$4) and ($5 is null or app_version=$5) and ($6 is null or channel=$6) and ($7 or not is_test)) ';
 execute base||$q$select jsonb_build_object(
 'events',coalesce(sum(event_count),0),
 'active_accounts',count(distinct actor_key) filter(where authenticated and platform='android' and event_name in ('app_foreground','auth_started','scan_opened','meal_save_clicked','nova_request_started','feedback_reply_viewed','update_clicked')),
 'anonymous_active_installs',count(distinct actor_key) filter(where not authenticated and platform='android' and event_name in ('app_foreground','auth_started','scan_opened','meal_save_clicked','nova_request_started')),
 'web_page_views',coalesce(sum(event_count) filter(where event_name='web_page_view'),0),
 'web_visitors',count(distinct actor_key) filter(where event_name='web_page_view'),
 'download_visitors',count(distinct actor_key) filter(where event_name='apk_download_clicked'),
 'observed_installs',coalesce(sum(event_count) filter(where event_name='first_observed_open'),0),
 'registered_accounts',count(distinct actor_key) filter(where event_name='account_registered'),
 'saved_meals',coalesce(sum(event_count) filter(where event_name='meal_saved'),0)) from filtered$q$
 into summary using p_environment,start_day,end_day,plat,ver,chan,incl;
 execute base||$q$select coalesce(jsonb_agg(to_jsonb(s) order by s.date),'[]') from (
 select day date,sum(event_count) events,count(distinct actor_key) filter(where authenticated and event_name in ('app_foreground','auth_started','scan_opened','meal_save_clicked','nova_request_started')) active_accounts,
 coalesce(sum(event_count) filter(where event_name='meal_saved'),0) saved_meals from filtered group by day) s$q$
 into series using p_environment,start_day,end_day,plat,ver,chan,incl;
 if p_view='acquisition' then
  base='with filtered as (select * from public.analytics_events where environment=$1 and effective_at>=($2::date::timestamp at time zone ''Asia/Shanghai'') and effective_at<(($3::date+1)::timestamp at time zone ''Asia/Shanghai'') and ($4 is null or platform=$4) and ($5 is null or app_version=$5) and ($6 is null or coalesce(properties->>''channel'',''direct'')=$6) and ($7 or not is_test)), ';
  base=base||$q$visits as (select distinct on (actor_key) actor_key,consent_revision,effective_at,coalesce(properties->>'channel','direct') channel,
    coalesce(properties->>'campaign','unknown') campaign,coalesce(properties->>'medium','other') medium,coalesce(properties->>'content','other') content
    from filtered where platform='web' and event_name='web_page_view' order by actor_key,effective_at),
  attributed as (select v.*,coalesce(first_touch.properties->>'channel','unknown') first_channel,
    coalesce(recent_touch.properties->>'channel','direct') recent_channel
    ,(select count(*) from filtered e where e.event_name='web_page_view' and e.actor_key=v.actor_key) page_views
    from visits v
    left join lateral (select properties from public.analytics_events h where h.environment=$1 and h.consent_revision=v.consent_revision
      and h.event_name='web_page_view' and h.platform='web' and h.effective_at<=v.effective_at
      and coalesce(h.properties->>'channel','direct')<>'direct' order by h.effective_at limit 1) first_touch on true
    left join lateral (select properties from public.analytics_events h where h.environment=$1 and h.consent_revision=v.consent_revision
      and h.event_name='web_page_view' and h.platform='web' and h.effective_at between v.effective_at-interval '7 days' and v.effective_at
      and coalesce(h.properties->>'channel','direct')<>'direct' order by h.effective_at desc limit 1) recent_touch on true) $q$;
  qry=$q$select channel,campaign,medium,content,first_channel,recent_channel,count(*) visitors,sum(a.page_views) page_views,
    count(*) filter(where exists(select 1 from filtered e where e.event_name='apk_download_clicked' and e.actor_key=a.actor_key)) download_visitors
    from attributed a group by channel,campaign,medium,content,first_channel,recent_channel$q$;
 elsif p_view='versions' then qry='select f.platform,case when g.n<5 and not $7 then ''other_small_sample'' else f.app_version end app_version,count(distinct f.actor_key) actors,sum(f.event_count) events from filtered f join (select platform,app_version,count(distinct actor_key)n from filtered group by platform,app_version)g using(platform,app_version) group by f.platform,case when g.n<5 and not $7 then ''other_small_sample'' else f.app_version end';
 elsif p_view='quality' then qry='select event_name,platform,sum(event_count) events,count(distinct actor_key) actors,min(first_at) first_seen,max(last_at) last_seen from filtered group by event_name,platform';
 elsif p_view='errors' then
  base='with filtered as (select * from public.analytics_events where environment=$1 and not exists(select 1 from public.analytics_consent_records c join public.app_users u on u.id=c.user_id where c.consent_revision=analytics_events.consent_revision and u.status<>''active'') and effective_at>=($2::date::timestamp at time zone ''Asia/Shanghai'') and effective_at<(($3::date+1)::timestamp at time zone ''Asia/Shanghai'') and ($4 is null or platform=$4) and ($5 is null or app_version=$5) and ($6 is null or coalesce(properties->>''channel'',''direct'')=$6) and ($7 or not is_test)) ';
  qry='select f.event_name,case when g.n<5 and not $7 then ''other_small_sample'' else coalesce(f.properties->>''error_fingerprint'',f.properties->>''error_type'',''unknown'') end error_fingerprint,case when g.n<5 and not $7 then ''other_small_sample'' else f.app_version end app_version,count(*) events,count(distinct f.actor_key) affected_actors,min(f.effective_at) first_seen,max(f.effective_at) last_seen from filtered f join (select event_name,coalesce(properties->>''error_fingerprint'',properties->>''error_type'',''unknown'') fingerprint,app_version,count(distinct actor_key)n from filtered where diagnostic group by event_name,coalesce(properties->>''error_fingerprint'',properties->>''error_type'',''unknown''),app_version)g on g.event_name=f.event_name and g.app_version=f.app_version and g.fingerprint=coalesce(f.properties->>''error_fingerprint'',f.properties->>''error_type'',''unknown'') where f.diagnostic group by f.event_name,case when g.n<5 and not $7 then ''other_small_sample'' else coalesce(f.properties->>''error_fingerprint'',f.properties->>''error_type'',''unknown'') end,case when g.n<5 and not $7 then ''other_small_sample'' else f.app_version end';
 elsif p_view='retention' then
  base='with filtered as (select * from public.analytics_daily_actor_facts where environment=$1 and not exists(select 1 from public.analytics_consent_records c join public.app_users u on u.id=c.user_id where c.consent_revision=analytics_daily_actor_facts.consent_revision and u.status<>''active'') and authenticated and ($4 is null or platform=$4) and ($5 is null or app_version=$5) and ($6 is null or channel=$6) and ($7 or not is_test)), activated as (select actor_key,min(first_active_day) cohort from public.analytics_actor_activation where environment=$1 and ($7 or not is_test) group by actor_key), cohorts as(select * from activated a where cohort between $2 and $3 and exists(select 1 from filtered f where f.actor_key=a.actor_key and f.day=a.cohort and f.event_name in (''app_foreground'',''auth_started'',''scan_opened'',''meal_save_clicked'',''nova_request_started''))) ';
  qry=$q$select cohort,count(*) cohort_accounts,
  case when cohort+1>=(now() at time zone 'Asia/Shanghai')::date then null else count(*) filter(where exists(select 1 from filtered f where f.actor_key=c.actor_key and f.day=c.cohort+1 and f.event_name in ('app_foreground','auth_started','scan_opened','meal_save_clicked','nova_request_started')))::numeric/count(*) end d1,
  case when cohort+7>=(now() at time zone 'Asia/Shanghai')::date then null else count(*) filter(where exists(select 1 from filtered f where f.actor_key=c.actor_key and f.day=c.cohort+7 and f.event_name in ('app_foreground','auth_started','scan_opened','meal_save_clicked','nova_request_started')))::numeric/count(*) end d7,
  case when cohort+30>=(now() at time zone 'Asia/Shanghai')::date then null else count(*) filter(where exists(select 1 from filtered f where f.actor_key=c.actor_key and f.day=c.cohort+30 and f.event_name in ('app_foreground','auth_started','scan_opened','meal_save_clicked','nova_request_started')))::numeric/count(*) end d30,
  case when cohort+1>=(now() at time zone 'Asia/Shanghai')::date then null else count(*) filter(where exists(select 1 from filtered f where f.actor_key=c.actor_key and f.day=c.cohort+1 and f.event_name='meal_saved'))::numeric/count(*) end meal_d1
  from cohorts c group by cohort$q$;
 elsif p_view='funnels' then
  -- Closed ordered website funnel in one session; server-confirmed App results remain separate.
  base='with filtered as (select * from public.analytics_events where environment=$1 and not exists(select 1 from public.analytics_consent_records c join public.app_users u on u.id=c.user_id where c.consent_revision=analytics_events.consent_revision and u.status<>''active'') and effective_at>=($2::date::timestamp at time zone ''Asia/Shanghai'') and effective_at<(($3::date+1)::timestamp at time zone ''Asia/Shanghai'') and ($4 is null or platform=$4) and ($5 is null or app_version=$5) and ($6 is null or coalesce(properties->>''channel'',''direct'')=$6) and ($7 or not is_test)), visits as(select actor_key,session_id,min(effective_at) t from filtered where event_name=''web_page_view'' group by actor_key,session_id), demo as(select v.actor_key,v.session_id,min(e.effective_at) t from visits v join filtered e on e.actor_key=v.actor_key and e.session_id=v.session_id and e.event_name=''web_demo_started'' and e.effective_at>=v.t group by v.actor_key,v.session_id), downloaded as(select d.actor_key,d.session_id,min(e.effective_at) t from demo d join filtered e on e.actor_key=d.actor_key and e.session_id=d.session_id and e.event_name=''apk_download_clicked'' and e.effective_at>=d.t group by d.actor_key,d.session_id) ';
  qry=$q$select 'website' funnel,'visit' step,count(distinct actor_key) actors from visits
  union all select 'website','demo',count(distinct actor_key) from demo
  union all select 'website','download',count(distinct actor_key) from downloaded
  union all select 'app_observation','auth_started',count(distinct operation_id) from filtered where event_name='auth_started'
  union all select 'app_observation','auth_completed',count(distinct operation_id) from filtered where event_name='auth_completed' and source='server'
  union all select 'app_observation','meal_saved',count(distinct actor_key) from filtered where event_name='meal_saved' and source='server'
  union all select 'nova','started',count(distinct operation_id) from filtered where event_name='nova_request_started'
  union all select 'nova','display_completed',count(distinct operation_id) from filtered where event_name='nova_display_terminal' and properties->>'outcome'='completed'
  union all select 'nova','server_completed',count(distinct operation_id) from filtered where event_name='nova_server_terminal' and source='server'$q$;
 else qry='select event_name,platform,count(distinct actor_key) actors,sum(event_count) events,public.analytics_hist_quantile(public.analytics_hist_merge(array_agg(duration_histogram)),0.95) duration_p95 from filtered group by event_name,platform';end if;
 execute base||'select count(*) from ('||qry||') grouped' into total using p_environment,start_day,end_day,plat,ver,chan,incl;
 execute base||'select coalesce(jsonb_agg(to_jsonb(p)),''[]'') from (select * from ('||qry||') grouped order by 1,2 limit $8 offset $9) p'
 into rows using p_environment,start_day,end_day,plat,ver,chan,incl,sz,(pg-1)*sz;
 notes=jsonb_build_array('仅包含有效授权且成功观测的数据；未知不等于零。','今日为进行中，最近72小时仍可能补传；服务端异步投影有延迟。','官网与App分别统计，无指纹跨端归因。','App登录结果可能无法关联同一客户端操作；不据此伪造完整闭合转化率。','诊断只覆盖明确授权且支持的客户端，不代表全部原生崩溃/ANR。','推送accepted只表示服务商接受，displayed的观测方式未知时不能计算直接展示率。','餐次和提醒修改是持久化状态变更观测；两次投影之间覆盖的中间状态未知，不当作完整点击次数。','版本与诊断组合少于5个主体时合并为other_small_sample；内部测试模式可查看未合并分组。');
 if p_view in ('errors','funnels') and end_day-start_day>89 then raise exception 'ANALYTICS_DETAIL_RANGE_EXCEEDED';end if;
 return jsonb_build_object('view',p_view,'filters',p_filters,'watermark',watermark,'metric_version','1','collection_started_at',started,'summary',summary,'series',series,'rows',rows,'total',total,'page',pg,'pageSize',sz,'notes',notes,
 'quality',coalesce((select jsonb_agg(to_jsonb(q)) from (select reason,sum(event_count) events from public.analytics_quality_daily where environment=p_environment and day between start_day and end_day group by reason)q),'[]'));
end $$;

do $$ declare f record;begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'analytics\_%' escape '\' loop
execute format('revoke all on function %s from public,anon,authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;end $$;
