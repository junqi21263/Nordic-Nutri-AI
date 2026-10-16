-- These catalogs are consumed only by trusted Cloud Functions. The anonymous
-- SELECT grant and disabled RLS exposed internal asset metadata to the public.
alter table public.uploaded_assets enable row level security;
alter table public.health_plan_items enable row level security;

revoke all on table public.uploaded_assets, public.health_plan_items
  from public, anon, authenticated;

drop policy if exists "uploaded assets: server only" on public.uploaded_assets;
create policy "uploaded assets: server only"
  on public.uploaded_assets for all to public using (false) with check (false);

drop policy if exists "health plan items: server only" on public.health_plan_items;
create policy "health plan items: server only"
  on public.health_plan_items for all to public using (false) with check (false);
