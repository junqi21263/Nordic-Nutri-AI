alter table public.meal_reminder_schedules
  add column if not exists locale text not null default 'zh-CN'
  check (locale in ('zh-CN', 'zh-TW', 'en'));

-- Rollback (manual): alter table public.meal_reminder_schedules drop column locale;
