-- Allow the dev Growth Plan Hunyuan text worker to persist daily insights.
alter table public.daily_nutrition_insights
  drop constraint if exists daily_nutrition_insights_provider_check;

alter table public.daily_nutrition_insights
  add constraint daily_nutrition_insights_provider_check
  check (provider in ('cloudbase', 'deepseek', 'hunyuan-exp', 'rule_v3'));
