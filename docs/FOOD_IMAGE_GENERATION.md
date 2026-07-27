# Food AI Image Generation (Hunyuan)

Async Hunyuan food-photo pipeline for Nordic Nutri AI. Mini-program clients never
call image generation — they only load **approved permanent** Storage/CDN URLs.

## Architecture decisions

| Topic | Choice |
|-------|--------|
| Runtime | Existing HTTP cloud function `get-login-ticket` (not CloudRun) |
| Model group | `ai.createImageModel("hunyuan-image")` (@cloudbase/node-sdk ≥ 3.18.3) |
| Model ID | Env `HY_IMAGE_MODEL`, default `HY-Image-3.0-Plus-4090-Tob-v1.0` (CloudBase 小程序成长计划二期 docs) |
| Size | Official `1280x720` then sharp crop to 4:3 (`1024x768` detail / `320x240` list / `160x120` thumb) |
| Queue | Table `food_image_jobs` + `POST /api/admin/food-image-jobs/worker` |
| Trigger | Create-job fire-and-forget `setImmediate` worker **plus** optional CloudBase timer hitting `/worker` |

## Why not invent model IDs

Confirmed from CloudBase docs (not guessed):

- https://docs.cloudbase.net/ai/image-model/overview
- https://docs.cloudbase.net/ai/ai-inspire-plan
- https://docs.cloudbase.net/ai/ai-inspire-plan-image-upgrade

Prompt max length is **500 characters** — templates live in `food-image-prompts.cjs`.

## Admin API (Bearer + `app_users.is_admin`)

| Method | Path |
|--------|------|
| POST | `/api/admin/food-image-jobs` |
| POST | `/api/admin/food-image-jobs/batch` (max 100) |
| GET | `/api/admin/food-image-jobs` |
| GET | `/api/admin/food-image-jobs/:id` |
| POST | `/api/admin/food-image-jobs/worker` |
| GET | `/api/admin/food-image-jobs/stats` |
| POST | `/api/admin/food-images/:id/approve` |
| POST | `/api/admin/food-images/:id/reject` |
| POST | `/api/admin/foods/:id/regenerate-image` |

Lightweight UI: open `cloudbase/admin/food-images.html` in a browser.

## Storage layout

```
food-library/{foodId}/{imageId}/original.{ext}
food-library/{foodId}/{imageId}/thumbnail.webp
food-library/{foodId}/{imageId}/list.webp
food-library/{foodId}/{imageId}/detail.webp
```

Temporary Hunyuan URLs are **never** written to `source_url` / permanent fields.

## Migration

```bash
# plan / apply via CloudBase MCP or console SQL
cloudbase/pg/migrations/0013_food_image_generation.sql
```

## Console checklist

1. Ensure 小程序成长计划 / Token Credits + 生图额度 active for env `lewis-healthy-d4glgqqzv73a5bc10`.
2. Cloud function timeout ≥ 300s (prefer 900s) for `get-login-ticket`.
3. Set env vars from `.env.example` (`HY_IMAGE_*`, `FOOD_IMAGE_*`).
4. Bump `@cloudbase/node-sdk` ≥ 3.18.3 and redeploy (forces `@cloudbase/ai` ≥ 2.30.0).
5. Promote admin: `update public.app_users set is_admin = true where id = '<uuid>';`
6. Optional: timer trigger every 1–5 minutes → `POST .../api/admin/food-image-jobs/worker`.
7. Verify CloudBase Storage upload works in this HTTP function (avatar path currently forces data-URL fallback; food pipeline still uses `uploadFile`).

### Auth pitfall (HTTP function + `CLOUDBASE_APIKEY`)

This function **requires** `CLOUDBASE_APIKEY` for PostgreSQL. `@cloudbase/node-sdk` `init({ env })` will prefer that API key over SCF ambient `TENCENTCLOUD_SECRETID` / `TENCENTCLOUD_SECRETKEY`, and Hunyuan image calls then fail in ~1s with `HY_IMAGE_GENERATE_FAILED`.

The runtime now hides `CLOUDBASE_APIKEY` while constructing the AI client so image calls use SCF credentials. After redeploy, cold-start logs should show:

`[hunyuan] ai auth mode=scf-ambient ...`

If ambient keys are missing, set permanent `TENCENTCLOUD_SECRET_ID` + `TENCENTCLOUD_SECRET_KEY` (underscore form) on the function.

### Diagnose

Admin UI → **诊断混元生图**, or:

`POST /api/admin/food-image-jobs/diagnose`

Expect `ok: true` and `hasTemporaryUrl: true` (URL is 24h temp — worker still downloads + uploads to Storage).

## Smoke test (1 food × 1 image)

1. Insert or pick food「水煮鸡胸肉」.
2. `POST /api/admin/food-image-jobs` with `candidateCount: 1`, `cookingMethod: "水煮"`, force true.
3. `POST .../worker` if async worker did not run.
4. Approve the candidate.
5. Confirm DB stores Storage CDN URLs only (no `hy-*.cos` temp host as permanent).

## Quota dashboard

CloudBase console → AI / 小程序成长计划 resource pack usage for the env.
