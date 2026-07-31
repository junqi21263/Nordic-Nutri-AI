-- Persist structured reject reason codes for food image review analytics.
alter table public.food_images
  add column if not exists reject_reason_code text
    check (
      reject_reason_code is null
      or reject_reason_code in (
        'wrong_identity',
        'wrong_doneness',
        'extra_foods',
        'sauce_or_seasoning',
        'style_off',
        'other'
      )
    );

comment on column public.food_images.reject_reason_code is
  'Structured admin reject reason for prompt correction and ops analytics';
