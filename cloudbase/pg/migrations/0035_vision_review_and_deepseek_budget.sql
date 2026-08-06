-- Vision image review + retention support; moderation source vision; DeepSeek daily token counter helper.

-- Allow vision as a content-moderation source and store optional quarantine path.
alter table public.content_moderation_flags
  drop constraint if exists content_moderation_flags_source_check;

alter table public.content_moderation_flags
  add constraint content_moderation_flags_source_check
  check (source in ('feedback', 'coach', 'nickname', 'export', 'vision'));

alter table public.content_moderation_flags
  add column if not exists image_path text
  check (image_path is null or char_length(image_path) between 1 and 512);

create index if not exists content_moderation_flags_source_created_at_idx
on public.content_moderation_flags (source, created_at desc);

-- Manual review status for successful recognitions.
alter table public.ai_analysis
  add column if not exists review_status text not null default 'pending'
  check (review_status in ('pending', 'reviewed', 'flagged'));

create index if not exists ai_analysis_review_status_created_at_idx
on public.ai_analysis (review_status, created_at desc);

create index if not exists ai_analysis_image_path_created_at_idx
on public.ai_analysis (created_at desc)
where image_path is not null;

-- Atomic DeepSeek daily budget: call count + token units in one Shanghai calendar day.
create or replace function public.consume_deepseek_daily_budget(
  p_user_id uuid,
  p_call_limit integer default 50,
  p_token_limit integer default 120000,
  p_token_units integer default 0
)
returns table (allowed boolean, call_used integer, token_used integer)
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_window_started_at timestamptz := date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai';
  v_call_used integer;
  v_token_used integer;
  v_token_add integer := greatest(0, coalesce(p_token_units, 0));
begin
  if p_call_limit < 1 or p_call_limit > 500 then
    raise exception 'deepseek daily call limit is invalid';
  end if;
  if p_token_limit < 1000 or p_token_limit > 5000000 then
    raise exception 'deepseek daily token limit is invalid';
  end if;

  -- Calls
  insert into private.rate_limit_windows (user_id, operation, window_started_at, request_count)
  values (p_user_id, 'deepseek_daily_call', v_window_started_at, 1)
  on conflict (user_id, operation, window_started_at) do update
    set request_count = private.rate_limit_windows.request_count + 1,
        updated_at = now()
    where private.rate_limit_windows.request_count < p_call_limit
  returning request_count into v_call_used;

  if not found then
    select usage_window.request_count into v_call_used
    from private.rate_limit_windows usage_window
    where usage_window.user_id = p_user_id
      and usage_window.operation = 'deepseek_daily_call'
      and usage_window.window_started_at = v_window_started_at;
    select coalesce((
      select usage_window.request_count
      from private.rate_limit_windows usage_window
      where usage_window.user_id = p_user_id
        and usage_window.operation = 'deepseek_daily_tokens'
        and usage_window.window_started_at = v_window_started_at
    ), 0) into v_token_used;
    return query select false, coalesce(v_call_used, p_call_limit), v_token_used;
    return;
  end if;

  -- Tokens (additive after call admitted). Reject if already at/over limit before add.
  select coalesce((
    select usage_window.request_count
    from private.rate_limit_windows usage_window
    where usage_window.user_id = p_user_id
      and usage_window.operation = 'deepseek_daily_tokens'
      and usage_window.window_started_at = v_window_started_at
  ), 0) into v_token_used;

  if v_token_used >= p_token_limit then
    -- roll back the call increment
    update private.rate_limit_windows
      set request_count = greatest(0, request_count - 1), updated_at = now()
    where user_id = p_user_id
      and operation = 'deepseek_daily_call'
      and window_started_at = v_window_started_at;
    return query select false, greatest(0, v_call_used - 1), v_token_used;
    return;
  end if;

  if v_token_add > 0 then
    insert into private.rate_limit_windows (user_id, operation, window_started_at, request_count)
    values (p_user_id, 'deepseek_daily_tokens', v_window_started_at, least(p_token_limit, v_token_add))
    on conflict (user_id, operation, window_started_at) do update
      set request_count = least(
            p_token_limit,
            private.rate_limit_windows.request_count + excluded.request_count
          ),
          updated_at = now()
    returning request_count into v_token_used;
  end if;

  return query select true, v_call_used, coalesce(v_token_used, 0);
end;
$$;

create or replace function public.get_deepseek_daily_budget_usage(
  p_user_id uuid
)
returns table (call_used integer, token_used integer)
language sql
security definer
set search_path = private, public, pg_temp
as $$
  select
    coalesce((
      select usage_window.request_count
      from private.rate_limit_windows usage_window
      where usage_window.user_id = p_user_id
        and usage_window.operation = 'deepseek_daily_call'
        and usage_window.window_started_at = (date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai')
    ), 0)::integer,
    coalesce((
      select usage_window.request_count
      from private.rate_limit_windows usage_window
      where usage_window.user_id = p_user_id
        and usage_window.operation = 'deepseek_daily_tokens'
        and usage_window.window_started_at = (date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai')
    ), 0)::integer;
$$;

create or replace function public.add_deepseek_daily_tokens(
  p_user_id uuid,
  p_token_units integer,
  p_token_limit integer default 120000
)
returns table (token_used integer)
language plpgsql
security definer
set search_path = private, public, pg_temp
as $$
declare
  v_window_started_at timestamptz := date_trunc('day', now() at time zone 'Asia/Shanghai') at time zone 'Asia/Shanghai';
  v_token_used integer;
  v_add integer := greatest(0, coalesce(p_token_units, 0));
begin
  if v_add = 0 then
    select coalesce((
      select usage_window.request_count
      from private.rate_limit_windows usage_window
      where usage_window.user_id = p_user_id
        and usage_window.operation = 'deepseek_daily_tokens'
        and usage_window.window_started_at = v_window_started_at
    ), 0) into v_token_used;
    return query select v_token_used;
    return;
  end if;

  insert into private.rate_limit_windows (user_id, operation, window_started_at, request_count)
  values (p_user_id, 'deepseek_daily_tokens', v_window_started_at, least(p_token_limit, v_add))
  on conflict (user_id, operation, window_started_at) do update
    set request_count = least(
          p_token_limit,
          private.rate_limit_windows.request_count + excluded.request_count
        ),
        updated_at = now()
  returning request_count into v_token_used;

  return query select coalesce(v_token_used, 0);
end;
$$;

revoke all on function public.consume_deepseek_daily_budget(uuid, integer, integer, integer) from public, anon, authenticated;
revoke all on function public.get_deepseek_daily_budget_usage(uuid) from public, anon, authenticated;
revoke all on function public.add_deepseek_daily_tokens(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_deepseek_daily_budget(uuid, integer, integer, integer) to service_role;
grant execute on function public.get_deepseek_daily_budget_usage(uuid) to service_role;
grant execute on function public.add_deepseek_daily_tokens(uuid, integer, integer) to service_role;
