-- 0052: generic, environment-local AI model catalog.
-- Provider/model values are data, not a provider enum. Secrets stay in the
-- function environment and are referenced only by api_key_env.

create table if not exists public.ai_model_configs (
  id uuid primary key default gen_random_uuid(),
  provider_key text not null check (provider_key ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$'),
  model_key text not null check (model_key ~ '^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$'),
  display_name text not null,
  base_url text,
  endpoint text,
  protocol text,
  api_key_env text not null check (api_key_env ~ '^[A-Z][A-Z0-9_]{0,127}$'),
  timeout_ms integer check (timeout_ms is null or timeout_ms between 100 and 300000),
  max_tokens integer check (max_tokens is null or max_tokens between 1 and 200000),
  temperature numeric(4,3) check (temperature is null or temperature between 0 and 2),
  feature_keys text[] not null default '{}',
  enabled boolean not null default true,
  metadata jsonb not null default '{}',
  updated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_key, model_key)
);

create index if not exists ai_model_configs_provider_model_idx
  on public.ai_model_configs (provider_key, model_key);

drop trigger if exists ai_model_configs_set_updated_at on public.ai_model_configs;
create trigger ai_model_configs_set_updated_at
  before update on public.ai_model_configs
  for each row execute function public.set_updated_at();

alter table public.ai_model_configs enable row level security;
drop policy if exists "ai model configs: server only" on public.ai_model_configs;
create policy "ai model configs: server only" on public.ai_model_configs
  for all to public using (false) with check (false);
