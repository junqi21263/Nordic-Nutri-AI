-- Optional analytics only. No event-writing trigger is installed on a business table.
-- Rollback: disable collection/maintenance, revert application routes; retain isolated tables.
create table public.analytics_consent_records (
 consent_revision uuid primary key default gen_random_uuid(), environment text not null,
 anonymous_id uuid not null, platform text not null check(platform in ('android','web')),
 user_id uuid references public.app_users(id) on delete cascade, actor_key text not null,
 analytics boolean not null, diagnostics boolean not null, created_at timestamptz not null default now(),
 revoked_at timestamptz, expires_at timestamptz not null default now()+interval '30 days',
 is_test boolean not null default false
);
create index analytics_consent_actor on public.analytics_consent_records(environment,anonymous_id,created_at desc);
create index analytics_consent_user on public.analytics_consent_records(user_id,created_at desc);
create table public.analytics_events (
 event_id uuid not null, consent_revision uuid not null references public.analytics_consent_records on delete cascade,
 environment text not null, actor_key text not null, authenticated boolean not null,
 anonymous_id uuid not null, session_id uuid not null, event_name text not null, schema_version integer not null default 1,
 platform text not null, app_version text not null, build_code integer, page_key text not null,
 operation_id uuid, attempt_id uuid, trace_id text, properties jsonb not null default '{}',
 source text not null check(source in ('client','server')), diagnostic boolean not null default false,
 occurred_at timestamptz not null, received_at timestamptz not null default now(), effective_at timestamptz not null,
 timestamp_quality text not null default 'client_unverified', is_test boolean not null default false,
 primary key(event_id,effective_at)
) partition by range(effective_at);
-- A default partition accepts all valid bounded timestamps; month partitions can be detached without changing global dedup.
create table public.analytics_events_default partition of public.analytics_events default;
create index analytics_events_time_name on public.analytics_events(environment,effective_at,event_name);
create index analytics_events_actor on public.analytics_events(actor_key,effective_at);
create index analytics_events_operation on public.analytics_events(operation_id,effective_at);
create table public.analytics_ingest_receipts (
 environment text not null,event_id uuid not null,consent_revision uuid not null references public.analytics_consent_records on delete cascade,
 session_id uuid not null,created_at timestamptz not null default now(),primary key(environment,event_id)
);
create index analytics_receipts_rate on public.analytics_ingest_receipts(consent_revision,created_at);
create table public.analytics_daily_actor_facts (
 environment text not null,actor_key text not null,consent_revision uuid not null references public.analytics_consent_records on delete cascade,
 day date not null,event_name text not null,platform text not null,app_version text not null,channel text not null default 'direct',
 authenticated boolean not null,is_test boolean not null,event_count bigint not null default 1,
 first_at timestamptz not null,last_at timestamptz not null,
 primary key(environment,actor_key,consent_revision,day,event_name,platform,app_version,channel)
);
create index analytics_facts_report on public.analytics_daily_actor_facts(environment,day,event_name);
create table public.analytics_outbox (
 business_key text primary key, consent_revision uuid not null references public.analytics_consent_records on delete cascade,
 event_name text not null, fact_id uuid not null, occurred_at timestamptz not null,properties jsonb not null,
 delivered_at timestamptz,created_at timestamptz not null default now()
);
create table public.analytics_projection_state (
 environment text primary key,watermark timestamptz not null default '-infinity',updated_at timestamptz not null default now()
);
create table public.analytics_report_jobs (
 id uuid primary key default gen_random_uuid(), actor_user_id uuid not null references public.app_users(id) on delete cascade,
 environment text not null,view text not null,format text not null check(format in ('csv','html')),
 filters jsonb not null,watermark timestamptz not null,snapshot jsonb not null,status text not null default 'ready',
 created_at timestamptz not null default now(),expires_at timestamptz not null default now()+interval '7 days'
);
create table public.analytics_quality_daily (
 environment text not null,day date not null,reason text not null,event_count bigint not null default 1,
 primary key(environment,day,reason)
);
-- All telemetry access goes through the existing server identity/admin guards.
do $$ declare n text; begin foreach n in array array['analytics_consent_records','analytics_events','analytics_events_default','analytics_ingest_receipts','analytics_daily_actor_facts','analytics_outbox','analytics_projection_state','analytics_report_jobs','analytics_quality_daily'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated',n);
 execute format('grant select,insert,update,delete on public.%I to service_role',n);
 end loop; end $$;

create function public.analytics_set_consent(p_environment text,p_anonymous_id uuid,p_platform text,p_user_id uuid,p_actor_key text,p_analytics boolean,p_diagnostics boolean,p_previous_revision uuid default null)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='3s' set lock_timeout='100ms' as $$
declare r public.analytics_consent_records; prev public.analytics_consent_records; begin
 perform pg_advisory_xact_lock(hashtextextended(p_environment||p_anonymous_id::text,0));
 select * into prev from public.analytics_consent_records where environment=p_environment and anonymous_id=p_anonymous_id order by created_at desc limit 1;
 if found and not (prev.user_id is not null and prev.user_id=p_user_id) and prev.consent_revision is distinct from p_previous_revision then
   raise exception using message='ANALYTICS_PREFERENCE_PROOF_REQUIRED',errcode='P0001';
 end if;
 if p_user_id is null and prev.consent_revision is not null and ((prev.revoked_at is not null) or (not prev.analytics and not prev.diagnostics)) and (p_analytics or p_diagnostics) then raise exception 'ANALYTICS_FRESH_ID_REQUIRED';end if;
 if p_user_id is not null and not exists(select 1 from public.app_users where id=p_user_id and status='active') then
   raise exception 'ANALYTICS_IDENTITY_INVALID';
 end if;
 update public.analytics_consent_records set revoked_at=coalesce(revoked_at,now())
 where environment=p_environment and revoked_at is null and (anonymous_id=p_anonymous_id or (p_user_id is not null and user_id=p_user_id));
 insert into public.analytics_consent_records(environment,anonymous_id,platform,user_id,actor_key,analytics,diagnostics,is_test)
 values(p_environment,p_anonymous_id,p_platform,p_user_id,p_actor_key,p_analytics,p_diagnostics,
 p_environment like 'test-%' or coalesce((select is_admin from public.app_users where id=p_user_id),false)) returning * into r;
 return to_jsonb(r)-'user_id'; end $$;

create function public.analytics_get_consent(p_environment text,p_user_id uuid,p_anonymous_id uuid default null,p_platform text default 'android')
returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce((select to_jsonb(c)-'user_id' from public.analytics_consent_records c
 where environment=p_environment and user_id=p_user_id and platform=p_platform
 and (p_anonymous_id is null or anonymous_id=p_anonymous_id) and revoked_at is null and expires_at>now()
 order by created_at desc limit 1),'{}'::jsonb)
$$;

create function public.analytics_record_event(p_consent public.analytics_consent_records,p_event jsonb,p_source text)
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
 return 'accepted';end $$;

create function public.analytics_ingest(p_environment text,p_revision uuid,p_user_id uuid,p_events jsonb)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='3s' set lock_timeout='100ms' as $$
declare c public.analytics_consent_records;e jsonb;results jsonb='[]';reason text;status text; per_min integer;per_day integer;begin
 perform pg_advisory_xact_lock(hashtextextended(p_revision::text,0));
 select * into c from public.analytics_consent_records where consent_revision=p_revision and environment=p_environment for update;
 if not found or c.revoked_at is not null or c.expires_at<=now() then raise exception 'ANALYTICS_CONSENT_REVOKED';end if;
 if c.user_id is not null and not exists(select 1 from public.app_users u where u.id=c.user_id and u.status='active') then raise exception 'ANALYTICS_IDENTITY_INVALID';end if;
 if c.user_id is distinct from p_user_id then raise exception 'ANALYTICS_IDENTITY_MISMATCH';end if;
 if jsonb_typeof(p_events)<>'array' or jsonb_array_length(p_events)>50 then raise exception 'ANALYTICS_BATCH_INVALID';end if;
 perform pg_advisory_xact_lock(hashtextextended(c.environment||c.anonymous_id::text,1));
 select count(*) into per_min from public.analytics_ingest_receipts r join public.analytics_consent_records c0 using(consent_revision) where c0.environment=p_environment and c0.anonymous_id=c.anonymous_id and r.created_at>now()-interval '1 minute';
 select count(*) into per_day from public.analytics_ingest_receipts r join public.analytics_consent_records c0 using(consent_revision) where c0.environment=p_environment and c0.anonymous_id=c.anonymous_id and r.created_at>=date_trunc('day',now());
 for e in select value from jsonb_array_elements(p_events) loop
  reason=null;
  if (e->>'anonymous_id')::uuid<>c.anonymous_id or (e->>'consent_revision')::uuid<>p_revision or e->>'platform'<>c.platform then reason='CONTEXT_MISMATCH';
  elsif coalesce((e->>'diagnostic')::boolean,false) and not c.diagnostics then reason='DIAGNOSTICS_DISABLED';
  elsif not coalesce((e->>'diagnostic')::boolean,false) and not c.analytics then reason='ANALYTICS_DISABLED';
  elsif per_min>=120 or per_day>=5000 then reason='RATE_LIMITED';end if;
  if reason is null then
   status=public.analytics_record_event(c,e,'client');
   if status='accepted' then per_min=per_min+1;per_day=per_day+1;end if;
  else status='rejected';
   insert into public.analytics_quality_daily(environment,day,reason) values(p_environment,(now() at time zone 'Asia/Shanghai')::date,reason)
   on conflict(environment,day,reason) do update set event_count=analytics_quality_daily.event_count+1;
  end if;
  results=results||jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('event_id',e->>'event_id','status',status,'reason',reason)));
 end loop;
 return jsonb_build_object('results',results);end $$;

-- Postcommit projection: only explicit coarse fields from committed rows, never meal/health/chat content.
create function public.analytics_project(p_environment text,p_limit integer default 500)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='5s' set lock_timeout='100ms' as $$
declare f record;c public.analytics_consent_records;o public.analytics_outbox;evt jsonb;n integer=0;last_watermark timestamptz;begin
 if not pg_try_advisory_xact_lock(hashtextextended('analytics-project:'||p_environment,0)) then return '{"busy":true}'::jsonb;end if;
 select watermark into last_watermark from public.analytics_projection_state where environment=p_environment;
 for f in
 with facts as (
 select 'meal_saved' event_name,m.id,m.user_id,m.created_at at_time,jsonb_build_object('entry',case when m.template_id is not null then 'template' when m.analysis_id is not null then 'scan' else 'manual' end,'is_first',not exists(select 1 from public.meal_records old where old.user_id=m.user_id and (old.created_at,old.id)<(m.created_at,m.id))) props from public.meal_records m
 union all select 'meal_deleted',id,user_id,deleted_at,'{}'::jsonb from public.meal_records where deleted_at is not null
 union all select 'account_registered',id,id,created_at,jsonb_build_object('method',coalesce(registration_channel,'unknown')) from public.app_users
 union all select 'auth_completed',s.id,s.user_id,s.created_at,jsonb_build_object('method','unknown') from public.auth_refresh_sessions s where not exists(select 1 from public.auth_refresh_sessions old where old.replaced_by=s.id)
 union all select 'template_saved',id,user_id,created_at,'{}'::jsonb from public.meal_templates
 union all select 'template_used',id,user_id,created_at,'{}'::jsonb from public.meal_records where template_id is not null
 union all select 'feedback_submitted',id,user_id,created_at,'{}'::jsonb from public.user_feedback
 union all select 'feedback_reply_viewed',id,user_id,reply_read_at,'{}'::jsonb from public.user_feedback where reply_read_at is not null
 union all select 'vision_started',id,user_id,created_at,'{}'::jsonb from public.ai_analysis
 union all select 'vision_terminal',id,user_id,coalesce(completed_at,updated_at),jsonb_build_object('outcome',case when status='succeeded' then 'succeeded' else 'failed' end) from public.ai_analysis where status in ('succeeded','failed','expired','cancelled')
 union all select 'nova_server_terminal',id,user_id,created_at,jsonb_build_object('outcome','completed') from public.coach_messages where role='assistant'
 union all select 'notification_read',id,user_id,read_at,jsonb_build_object('notification_kind',kind) from public.user_notifications where read_at is not null
 union all select 'push_delivery_event',id,user_id,accepted_at,jsonb_build_object('stage','accepted','observation_method','provider_ack') from public.push_delivery_attempts where accepted_at is not null
 union all select 'push_delivery_event_received',id,user_id,received_at,jsonb_build_object('stage','received','observation_method','direct') from public.push_delivery_attempts where received_at is not null
 union all select 'push_delivery_event_displayed',id,user_id,displayed_at,jsonb_build_object('stage','displayed','observation_method','unknown') from public.push_delivery_attempts where displayed_at is not null
 union all select 'push_delivery_event_opened',id,user_id,opened_at,jsonb_build_object('stage','opened','observation_method','direct') from public.push_delivery_attempts where opened_at is not null
 ) select facts.* from facts where at_time>=coalesce(last_watermark-interval '72 hours',(select min(created_at) from public.analytics_consent_records where environment=p_environment))
 and exists(select 1 from public.analytics_consent_records eligible where eligible.environment=p_environment and eligible.user_id=facts.user_id and eligible.analytics and eligible.revoked_at is null and eligible.created_at<=facts.at_time and eligible.expires_at>facts.at_time)
 and not exists(select 1 from public.analytics_outbox x where x.business_key=p_environment||':'||facts.event_name||':'||facts.id::text)
 order by at_time,id,event_name limit least(1000,greatest(1,p_limit))
 loop
  select * into c from public.analytics_consent_records eligible where eligible.environment=p_environment and eligible.user_id=f.user_id and eligible.analytics
   and eligible.created_at<=f.at_time and eligible.revoked_at is null and eligible.expires_at>f.at_time
   order by eligible.created_at desc limit 1;
  if c.consent_revision is null then continue;end if;
  insert into public.analytics_outbox(business_key,consent_revision,event_name,fact_id,occurred_at,properties)
   values(p_environment||':'||f.event_name||':'||f.id,c.consent_revision,f.event_name,f.id,f.at_time,f.props) on conflict do nothing;
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

create function public.analytics_report(p_environment text,p_view text,p_filters jsonb)
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
 if p_view='acquisition' then qry='select channel,count(distinct actor_key) filter(where event_name=''web_page_view'') visitors,coalesce(sum(event_count) filter(where event_name=''web_page_view''),0) page_views,count(distinct actor_key) filter(where event_name=''apk_download_clicked'') download_visitors from filtered where platform=''web'' group by channel';
 elsif p_view='versions' then qry='select platform,app_version,count(distinct actor_key) actors,sum(event_count) events from filtered group by platform,app_version';
 elsif p_view='quality' then qry='select event_name,platform,sum(event_count) events,count(distinct actor_key) actors,min(first_at) first_seen,max(last_at) last_seen from filtered group by event_name,platform';
 elsif p_view='errors' then
  base='with filtered as (select * from public.analytics_events where environment=$1 and not exists(select 1 from public.analytics_consent_records c join public.app_users u on u.id=c.user_id where c.consent_revision=analytics_events.consent_revision and u.status<>''active'') and effective_at>=($2::date::timestamp at time zone ''Asia/Shanghai'') and effective_at<(($3::date+1)::timestamp at time zone ''Asia/Shanghai'') and ($4 is null or platform=$4) and ($5 is null or app_version=$5) and ($6 is null or coalesce(properties->>''channel'',''direct'')=$6) and ($7 or not is_test)) ';
  qry='select event_name,coalesce(properties->>''error_fingerprint'',properties->>''error_type'',''unknown'') error_fingerprint,app_version,count(*) events,count(distinct actor_key) affected_actors,min(effective_at) first_seen,max(effective_at) last_seen from filtered where diagnostic group by event_name,coalesce(properties->>''error_fingerprint'',properties->>''error_type'',''unknown''),app_version';
 elsif p_view='retention' then
  base='with filtered as (select * from public.analytics_daily_actor_facts where environment=$1 and not exists(select 1 from public.analytics_consent_records c join public.app_users u on u.id=c.user_id where c.consent_revision=analytics_daily_actor_facts.consent_revision and u.status<>''active'') and authenticated and ($4 is null or platform=$4) and ($5 is null or app_version=$5) and ($6 is null or channel=$6) and ($7 or not is_test)), activated as (select actor_key,min(day) cohort from public.analytics_daily_actor_facts where environment=$1 and not exists(select 1 from public.analytics_consent_records c join public.app_users u on u.id=c.user_id where c.consent_revision=analytics_daily_actor_facts.consent_revision and u.status<>''active'') and authenticated and event_name in (''app_foreground'',''auth_started'',''scan_opened'',''meal_save_clicked'',''nova_request_started'') and ($7 or not is_test) group by actor_key), cohorts as(select * from activated a where cohort between $2 and $3 and exists(select 1 from filtered f where f.actor_key=a.actor_key and f.day=a.cohort and f.event_name in (''app_foreground'',''auth_started'',''scan_opened'',''meal_save_clicked'',''nova_request_started''))) ';
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
 else qry='select event_name,platform,count(distinct actor_key) actors,sum(event_count) events from filtered group by event_name,platform';end if;
 execute base||'select count(*) from ('||qry||') grouped' into total using p_environment,start_day,end_day,plat,ver,chan,incl;
 execute base||'select coalesce(jsonb_agg(to_jsonb(p)),''[]'') from (select * from ('||qry||') grouped order by 1,2 limit $8 offset $9) p'
 into rows using p_environment,start_day,end_day,plat,ver,chan,incl,sz,(pg-1)*sz;
 notes=jsonb_build_array('仅包含有效授权且成功观测的数据；未知不等于零。','今日为进行中，最近72小时仍可能补传；服务端异步投影有延迟。','官网与App分别统计，无指纹跨端归因。','App登录结果可能无法关联同一客户端操作；不据此伪造完整闭合转化率。','诊断只覆盖明确授权且支持的客户端，不代表全部原生崩溃/ANR。','推送accepted只表示服务商接受，displayed的观测方式未知时不能计算直接展示率。');
 if p_view in ('errors','funnels') and end_day-start_day>89 then raise exception 'ANALYTICS_DETAIL_RANGE_EXCEEDED';end if;
 return jsonb_build_object('view',p_view,'filters',p_filters,'watermark',watermark,'metric_version','1','collection_started_at',started,'summary',summary,'series',series,'rows',rows,'total',total,'page',pg,'pageSize',sz,'notes',notes,
 'quality',coalesce((select jsonb_agg(to_jsonb(q)) from (select reason,sum(event_count) events from public.analytics_quality_daily where environment=p_environment and day between start_day and end_day group by reason)q),'[]'));
end $$;

create function public.analytics_create_report(p_environment text,p_actor_user_id uuid,p_view text,p_format text,p_filters jsonb)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='10s' as $$
declare snap jsonb;r public.analytics_report_jobs;page_result jsonb;all_rows jsonb='[]';pn integer=1;begin
 perform pg_advisory_xact_lock(hashtextextended('analytics-report:'||p_actor_user_id,0));
 if (select count(*) from public.analytics_report_jobs where actor_user_id=p_actor_user_id and created_at>now()-interval '1 minute')>=2 then raise exception 'ANALYTICS_REPORT_RATE_LIMITED';end if;
 loop
  page_result=public.analytics_report(p_environment,p_view,p_filters||jsonb_build_object('page',pn,'pageSize',100));
  all_rows=all_rows||(page_result->'rows');
  exit when pn*100>=(page_result->>'total')::bigint;
  if pn>=100 then raise exception 'ANALYTICS_REPORT_TOO_LARGE';end if;
  pn=pn+1;
 end loop;
 snap=page_result||jsonb_build_object('rows',all_rows,'page',1,'pageSize',jsonb_array_length(all_rows));
 insert into public.analytics_report_jobs(actor_user_id,environment,view,format,filters,watermark,snapshot,status)
 values(p_actor_user_id,p_environment,p_view,p_format,p_filters,coalesce((snap->>'watermark')::timestamptz,now()),snap,'completed') returning * into r;
 return to_jsonb(r)-'snapshot';end $$;

create function public.analytics_maintenance(p_environment text)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='15s' set lock_timeout='100ms' as $$
declare projected jsonb;removed integer;begin
 delete from public.analytics_consent_records c using public.app_users u where c.user_id=u.id and c.environment=p_environment and u.status<>'active';
 get diagnostics removed=row_count;
 if removed>0 then delete from public.analytics_report_jobs where environment=p_environment;end if;
 projected=public.analytics_project(p_environment,500);
 delete from public.analytics_events where environment=p_environment and effective_at<now()-interval '90 days';
 delete from public.analytics_ingest_receipts where environment=p_environment and created_at<now()-interval '7 days';
 delete from public.analytics_daily_actor_facts where environment=p_environment and day<(now() at time zone 'Asia/Shanghai')::date-366;
 delete from public.analytics_outbox x using public.analytics_consent_records c where x.consent_revision=c.consent_revision and c.environment=p_environment and x.delivered_at<now()-interval '7 days';
 delete from public.analytics_report_jobs where environment=p_environment and expires_at<now();
 delete from public.analytics_consent_records where environment=p_environment and coalesce(revoked_at,expires_at)<now()-interval '366 days';
 delete from public.analytics_quality_daily where environment=p_environment and day<(now() at time zone 'Asia/Shanghai')::date-366;
 return projected;end $$;

-- A deleted app_users row cascades to consents, events, receipts and per-actor facts.
-- Exports contain aggregate groups only; no raw subject identifiers are exported.
-- All privileged functions must be unavailable to browser/ordinary authenticated roles.
do $$ declare f record;begin for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'analytics\_%' escape '\' loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
end loop;end $$;
