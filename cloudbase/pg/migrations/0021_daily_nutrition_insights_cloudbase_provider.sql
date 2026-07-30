-- Existing environments created before the dev Hunyuan migration need the
-- same provider set as a fresh 0020 install.
alter table public.daily_nutrition_insights
  drop constraint if exists daily_nutrition_insights_provider_check;

alter table public.daily_nutrition_insights
  add constraint daily_nutrition_insights_provider_check
  check (provider in ('cloudbase', 'deepseek', 'hunyuan-exp', 'rule_v3'));
