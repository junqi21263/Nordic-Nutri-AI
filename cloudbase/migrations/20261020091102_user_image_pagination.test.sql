-- Run only in an empty, disposable PostgreSQL database: psql -v ON_ERROR_STOP=1 -f <this file>.
begin;
create role anon;
create role authenticated;
create role service_role;
create table public.ai_analysis (id uuid,user_id uuid,image_path text,created_at timestamptz,status text,review_status text,raw_recognition jsonb);
create table public.content_moderation_flags (id uuid,user_id uuid,image_path text,created_at timestamptz,status text,source text);
create table public.profiles (id uuid,avatar_path text,created_at timestamptz,updated_at timestamptz);
create table public.uploaded_assets (id uuid,user_id uuid,object_path text,created_at timestamptz,status text);
\ir 20261020091102_user_image_pagination.sql

insert into public.ai_analysis
select md5(i::text)::uuid,'11111111-1111-1111-1111-111111111111',
  'cloud://image-'||i,'2026-10-20 16:00:00+08'::timestamptz-i*interval '1 hour',
  'succeeded',null,jsonb_build_object('mealName','Meal '||i)
from generate_series(1,213) i;
insert into public.uploaded_assets
select id,user_id,image_path,created_at,'uploaded' from public.ai_analysis;
insert into public.uploaded_assets values
  (md5('food')::uuid,null,'foods/catalog/test.jpg',now(),'uploaded'),
  (md5('deleted')::uuid,null,'cloud://deleted',now(),'deleted');
insert into public.profiles
select md5(('user'||i))::uuid, 'cloud://avatar-'||i, now(), now() from generate_series(1,4) i;
insert into public.profiles values (md5('default')::uuid,'default:food-1',now(),now());

do $$
declare result jsonb; ids text[];
begin
  result := public.list_ops_user_images(null,'all',1,40);
  assert (result->>'total')::int=217, 'exact count after cross-source deduplication';
  result := public.list_ops_user_images(null,'all',3,40);
  assert jsonb_array_length(result->'items')=40, 'page 3 must remain reachable';
  assert result->'items'->0->>'imagePath'='cloud://image-77', 'stable global time order';
  assert result->'items'->0->>'kind'='vision', 'vision wins over duplicate assets';
  result := public.list_ops_user_images(null,'all',6,40);
  assert jsonb_array_length(result->'items')=17, 'final page contains the oldest images';
  assert result->'items'->16->>'imagePath'='cloud://image-213', 'oldest image reachable';
  result := public.list_ops_user_images(null,'all',7,40);
  assert result->'items'='[]'::jsonb and (result->>'total')::int=217, 'empty page retains total';
  result := public.list_ops_user_images('11111111-1111-1111-1111-111111111111','all',1,40);
  assert (result->>'total')::int=213, 'user filter is applied before deduplication';
  select array_agg(item->>'id') into ids from generate_series(1,6) p
    cross join lateral jsonb_array_elements(public.list_ops_user_images(null,'all',p,40)->'items') item;
  assert cardinality(ids)=217 and (select count(distinct id) from unnest(ids) id)=217, 'pages have no gaps or duplicates';
  assert not has_function_privilege('authenticated','public.list_ops_user_images(uuid,text,integer,integer)','execute'), 'end users cannot enumerate uploads';
  assert not has_function_privilege('anon','public.list_ops_user_images(uuid,text,integer,integer)','execute'), 'anonymous access forbidden';
end $$;

insert into public.content_moderation_flags values
  (md5('blocked')::uuid,null,'cloud://blocked',now(),'open','vision');
do $$ begin
  assert (public.list_ops_user_images(null,'all',1,40)->>'total')::int=218;
  assert (public.list_ops_user_images(null,'resolved',1,40)->>'total')::int=217;
end $$;
rollback;
