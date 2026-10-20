-- Merge and deduplicate before pagination; never count a truncated source sample.
-- Apply before deploying the updated get-login-ticket function.
-- Rollback: deploy the previous function, then drop this RPC.
create or replace function public.list_ops_user_images(
  p_user_id uuid default null,
  p_status text default 'all',
  p_page integer default 1,
  p_page_size integer default 40
) returns jsonb language sql stable security invoker set search_path = public as $$
  with candidates as (
    select 'vision'::text as kind, 0 as priority, id, user_id, image_path,
      created_at, status, coalesce(review_status, 'pending') as review_status,
      raw_recognition->>'mealName' as meal_name
    from public.ai_analysis where image_path is not null
    union all
    select 'blocked', 1, id, user_id, image_path, created_at, status, null, null
    from public.content_moderation_flags
    where source = 'vision' and image_path is not null
      and (p_status = 'all' or status = p_status)
    union all
    select 'avatar', 2, id, id, avatar_path, coalesce(updated_at, created_at), null, null, null
    from public.profiles
    where avatar_path is not null and avatar_path <> '' and avatar_path not like 'default:%'
    union all
    select 'asset', 3, id, user_id, object_path, created_at, status, null, null
    from public.uploaded_assets
    where status <> 'deleted' and object_path !~ '(^|/)foods/'
  ), unique_images as (
    select distinct on (image_path) * from candidates
    where p_user_id is null or user_id = p_user_id
    order by image_path, priority, created_at desc nulls last, id
  ), paged as (
    select * from unique_images
    order by created_at desc nulls last, kind, id
    limit least(100, greatest(1, coalesce(p_page_size, 40)))
    offset (least(10000, greatest(1, coalesce(p_page, 1))) - 1)::bigint
      * least(100, greatest(1, coalesce(p_page_size, 40)))
  )
  select jsonb_build_object(
    'total', (select count(*) from unique_images),
    'items', coalesce((select jsonb_agg(jsonb_build_object(
      'kind', kind, 'id', id, 'userId', user_id, 'imagePath', image_path,
      'createdAt', created_at, 'status', status, 'reviewStatus', review_status,
      'mealName', meal_name
    ) order by created_at desc nulls last, kind, id) from paged), '[]'::jsonb)
  );
$$;
revoke all on function public.list_ops_user_images(uuid,text,integer,integer) from public,anon,authenticated;
grant execute on function public.list_ops_user_images(uuid,text,integer,integer) to service_role;
