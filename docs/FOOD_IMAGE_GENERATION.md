# Food AI Image Generation (Hunyuan)

Async Hunyuan food-photo pipeline for Nordic Nutri AI. Mini-program clients
never call image generation. They load **approved image paths resolved to the
active CDN** by the server.

## Architecture decisions

| Topic | Choice |
|-------|--------|
| Runtime | Existing HTTP cloud function `get-login-ticket` (not CloudRun) |
| Model group | `ai.createImageModel("hunyuan-image")` (@cloudbase/node-sdk ≥ 3.18.3) |
| Model ID | Env `HY_IMAGE_MODEL`, default `HY-Image-3.0-Plus-4090-Tob-v1.0` (CloudBase 小程序成长计划二期 docs) |
| Size | Official `1280x720` then sharp crop to 4:3 (`1024x768` detail / `320x240` list / `160x120` thumb). Display WebP variants only — Hunyuan `original` is not persisted. Default `candidateCount` is **1**. Rejected images best-effort delete their Storage variants. |
| Queue | Table `food_image_jobs` + `POST /api/admin/food-image-jobs/worker` |
| Trigger | Create-job fire-and-forget `setImmediate` worker **plus** optional CloudBase timer hitting `/worker` |

## Why not invent model IDs

Confirmed from CloudBase docs (not guessed):

- https://docs.cloudbase.net/ai/image-model/overview
- https://docs.cloudbase.net/ai/ai-inspire-plan
- https://docs.cloudbase.net/ai/ai-inspire-plan-image-upgrade

Prompt max length is **500 characters** — templates live in `food-image-prompts.cjs`.

### Prompt assembly (P0/P1)

Slots in order: identity → class → subject → state → correction → negatives → serving → style.  
Over budget, drop from the end (style first). `food-image-prompts.cjs` remains the single builder, but now delegates visual-form resolution to `food-image-visual-type.cjs` before selecting the subject template.

Visual-form priority is: manual `foods.visual_type` override → controlled visual-type tag → tag wording → Chinese name → English name → category → fallback. Within a source, rules are ordered by literal keyword length first and processed-form priority second. Thus `饮料粉` / `蛋白粉` / `葡萄酒` / `苹果醋` win over fruit flavour or ingredient terms such as `橙` / `葡萄` / `苹果`.

The builder snapshots `visualType`, `decisionSource`, `matchedKeywords`, `templateName`, `flavorColor`, `positivePrompt`, and `negativePrompt` in batch `prompt_plan_json`. The admin inspector exposes these values and can save `foods.visual_type`; blank means automatic resolution. Regenerate and rejected-batch retry rebuild using the latest rules and that override.

Hunyuan's current Node image API call accepts one `prompt` field, not a separate `negative_prompt`. The negative list is therefore stored independently for review and rendered as `禁止生成：…` inside the supported positive prompt.

Reject body may include `reasonCode`:

| Code | Meaning |
|------|---------|
| `wrong_identity` | Wrong food class |
| `wrong_doneness` | Raw/cooked mismatch |
| `extra_foods` | Sides / platter |
| `sauce_or_seasoning` | Heavy sauce |
| `style_off` | Style drift |
| `other` | Free text required |

Coded fragments fold into the next prompt correction slot. Persist `food_images.reject_reason_code` via migration `0029_food_image_reject_reason_code.sql`.

Ops: admin foods filter `missingImageSubject=true`, or `cloudbase/pg/scripts/list-missing-image-subjects.sql`, then fill `foods.image_subject_zh`.

### Category auto patrol

Configure watched categories in admin → **分类自动巡检**. The timer function
`food-image-batch-dispatcher` calls patrol before dispatching running batches:

1. Skip foods that already have an **approved primary for that visual profile**.
2. Create + start a category batch when candidates exist and no active batch
   for the same category/profile.
3. Cap creations by remaining daily quota (**500**/day, shared with
   `HY_IMAGE_DAILY_LIMIT` / `food_image_usage_daily`).
4. Per-rule **interval** (`interval_minutes`, 30–1440, default 60): timer may
   wake often, but a rule only creates a batch when its interval has elapsed
   since `last_run_at`. Admin **立即巡检一次** bypasses the interval.

Migrations: `0030_food_image_patrol_rules.sql`, `0031_food_image_patrol_interval.sql`.

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
food-library/{foodId}/{imageId}/thumbnail.webp
food-library/{foodId}/{imageId}/list.webp
food-library/{foodId}/{imageId}/detail.webp
```

Display WebP variants only. Legacy `original.*` files from older runs are deleted on reject when present.

`storage_path` is the only canonical image address. `thumbnailUrl`, `listUrl`
and `detailUrl` are derived at read time from `FOOD_IMAGE_CDN_BASE_URL`;
temporary Hunyuan URLs and temporary Storage URLs are never written to the
permanent URL columns.

Current main-environment default CDN:

```text
https://6c65-lewis-healthy-d4glgqqzv73a5bc10-1420560890.tcb.qcloud.la
```

If a custom HTTPS domain is added later, replace only
`FOOD_IMAGE_CDN_BASE_URL`; no image rows or mini-program code need changing.

## Migration

```bash
# plan / apply via CloudBase MCP or console SQL
cloudbase/pg/migrations/0013_food_image_generation.sql
cloudbase/pg/migrations/0037_food_visual_type.sql
```

## Console checklist

1. Ensure 小程序成长计划 / Token Credits + 生图额度 active for env `lewis-healthy-d4glgqqzv73a5bc10`.
2. Cloud function timeout ≥ 300s (prefer 900s) for `get-login-ticket`.
3. Set env vars from `.env.example` (`HY_IMAGE_*`, `FOOD_IMAGE_*`). Set
   `FOOD_IMAGE_CDN_BASE_URL` to the Storage CDN/custom-domain base URL.
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
5. Confirm new image rows have `storage_path`, while `original_url`,
   `thumb_url`, `medium_url` and `detail_url` remain null; API responses should
   contain URLs derived from the configured CDN base.

## Quota dashboard

CloudBase console → AI / 小程序成长计划 resource pack usage for the env.
# 历史主图审计

在后台“食材生图”中使用“旧图审计”处理历史错误图。该流程固定优先扫描饮料粉、酒类、醋、酱料、乳制品、粉末、罐头、零食和熟食等高风险加工食品。

1. 点击“预览风险项”只创建审计快照，不调用模型、不修改旧图。
2. 选择审计项后点击“执行 AI 复核”；结论只用于人工审核。
3. 对正确图片选择“保留旧图”；对错误图片选择“加入重生队列”。
4. 重生只产生新候选图，仍须沿用现有审核操作通过后才能设为主图；旧主图在此之前不会替换或删除。

单次预览仅支持 20、50 或 100 项，单次 AI 复核最多 100 项。模型调用失败会仅标记对应审计项失败，可稍后重试，不会影响其他项。
