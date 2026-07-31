# Category Auto Patrol for Food Images

**Date:** 2026-07-31  
**Status:** Implemented

## Goal

Admins configure watched food categories; a timer creates and starts image batches automatically. Humans only review candidates. Daily generation hard-capped at **500**.

## Rules

- Exclude foods that already have an **approved primary for the requested visual profile** (via `listBatchImageCandidates`).
- Shared daily counter: `food_image_usage_daily` + `HY_IMAGE_DAILY_LIMIT` (default 500); patrol also clamps to 500.
- Skip rule if an active (`draft`/`running`/`paused`) batch exists for same category + profile.
- Per-rule `interval_minutes` (30–1440, default 60): skip until elapsed since `last_run_at` (manual run-now bypasses).
- Batch size = `min(rule.batch_size, remaining_quota, 100)`.

## Components

| Piece | Role |
|-------|------|
| `0030_food_image_patrol_rules.sql` | Rule table |
| `0031_food_image_patrol_interval.sql` | Per-rule `interval_minutes` |
| `food-image-patrol-service.cjs` | CRUD + `runTrusted` |
| `food-image-batch-dispatcher` | Calls patrol then dispatch |
| Admin 「分类自动巡检」 | Configure rules, interval, quota, run once |

## Admin APIs

- `GET/POST /api/admin/food-image-patrol/rules`
- `PATCH/DELETE /api/admin/food-image-patrol/rules/:id`
- `GET /api/admin/food-image-patrol/quota`
- `POST /api/admin/food-image-patrol/run`
