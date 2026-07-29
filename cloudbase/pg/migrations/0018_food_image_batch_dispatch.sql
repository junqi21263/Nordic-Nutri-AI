-- Retry audit fields for category-based food image batches.
-- This migration is additive so existing batches remain readable.

alter table public.food_image_batch_items
  add column if not exists last_image_id uuid references public.food_images(id) on delete set null,
  add column if not exists retry_reason text;

alter table public.food_image_batch_items
  drop constraint if exists food_image_batch_items_retry_reason_length;
alter table public.food_image_batch_items
  add constraint food_image_batch_items_retry_reason_length
  check (retry_reason is null or char_length(retry_reason) <= 500);

create index if not exists food_image_batch_items_running_claim_idx
  on public.food_image_batch_items (status, next_retry_at, created_at)
  where status in ('pending', 'needs_retry');
