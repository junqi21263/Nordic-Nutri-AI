-- Exact website attribution filters and lightweight report history metadata.
-- Raw website events retain these dimensions; other views reject them rather than report inaccurate totals.
alter table public.analytics_report_jobs add column metric_version text generated always as (snapshot->>'metric_version') stored;

create or replace function public.analytics_report(p_environment text,p_view text,p_filters jsonb)
returns jsonb language plpgsql security definer set search_path='' set statement_timeout='5s' as $$
declare start_day date=(p_filters->>'from')::date;end_day date=(p_filters->>'to')::date;
 plat text=nullif(p_filters->>'platform','all');ver text=nullif(p_filters->>'version','');chan text=nullif(p_filters->>'channel','');loc text=nullif(p_filters->>'locale','');med text=nullif(p_filters->>'medium','');cont text=nullif(p_filters->>'content','');
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
  base='with filtered as (select * from public.analytics_events where environment=$1 and not exists(select 1 from public.analytics_consent_records c join public.app_users u on u.id=c.user_id where c.consent_revision=analytics_events.consent_revision and u.status<>''active'') and effective_at>=($2::date::timestamp at time zone ''Asia/Shanghai'') and effective_at<(($3::date+1)::timestamp at time zone ''Asia/Shanghai'') and ($4 is null or platform=$4) and ($5 is null or app_version=$5) and ($6 is null or coalesce(properties->>''channel'',''direct'')=$6) and ($7 or not is_test) and ($10 is null or properties->>''locale''=$10) and ($11 is null or properties->>''medium''=$11) and ($12 is null or properties->>''content''=$12)), ';
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
 execute base||'select count(*) from ('||qry||') grouped' into total using p_environment,start_day,end_day,plat,ver,chan,incl,sz,(pg-1)*sz,loc,med,cont;
 execute base||'select coalesce(jsonb_agg(to_jsonb(p)),''[]'') from (select * from ('||qry||') grouped order by 1,2 limit $8 offset $9) p'
 into rows using p_environment,start_day,end_day,plat,ver,chan,incl,sz,(pg-1)*sz,loc,med,cont;
 if p_view='acquisition' and (loc is not null or med is not null or cont is not null) then
  execute base||$q$select jsonb_build_object('web_visitors',count(*),'web_page_views',coalesce(sum(page_views),0),
    'download_visitors',count(*) filter(where exists(select 1 from filtered e where e.event_name='apk_download_clicked' and e.actor_key=a.actor_key)))
    from attributed a$q$ into summary using p_environment,start_day,end_day,plat,ver,chan,incl,sz,(pg-1)*sz,loc,med,cont;
  series='[]'::jsonb;
 end if;
 notes=jsonb_build_array('仅包含有效授权且成功观测的数据；未知不等于零。','今日为进行中，最近72小时仍可能补传；服务端异步投影有延迟。','官网与App分别统计，无指纹跨端归因。','App登录结果可能无法关联同一客户端操作；不据此伪造完整闭合转化率。','诊断只覆盖明确授权且支持的客户端，不代表全部原生崩溃/ANR。','推送accepted只表示服务商接受，displayed的观测方式未知时不能计算直接展示率。','餐次和提醒修改是持久化状态变更观测；两次投影之间覆盖的中间状态未知，不当作完整点击次数。','版本与诊断组合少于5个主体时合并为other_small_sample；内部测试模式可查看未合并分组。');
 if p_view<>'acquisition' and (loc is not null or med is not null or cont is not null) then raise exception 'ANALYTICS_FILTER_INVALID';end if;
 if p_view in ('errors','funnels') and end_day-start_day>89 then raise exception 'ANALYTICS_DETAIL_RANGE_EXCEEDED';end if;
 return jsonb_build_object('view',p_view,'filters',p_filters,'watermark',watermark,'metric_version','1','collection_started_at',started,'summary',summary,'series',series,'rows',rows,'total',total,'page',pg,'pageSize',sz,'notes',notes,
 'quality',coalesce((select jsonb_agg(to_jsonb(q)) from (select reason,sum(event_count) events from public.analytics_quality_daily where environment=p_environment and day between start_day and end_day group by reason)q),'[]'));
end $$;
