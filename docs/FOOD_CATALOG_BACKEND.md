# Food Catalog Backend

The unified food data model for Nordic Nutri AI. It introduces canonical
`foods`, `food_categories`, `food_tags`, `food_images`, source payloads, sync
jobs and image tasks alongside the legacy `food_catalog` cache table, and
exposes a richer API while keeping the existing `/foods` and `/foods/discover`
contracts backward-compatible.

## Architecture

| Layer | Technology |
|-------|-------------|
| API boundary | Single HTTP cloud function `get-login-ticket` (Node `http`, not Express) |
| Database | CloudBase PostgreSQL via `@cloudbase/js-sdk` `app.rdb()`, `public` schema |
| Auth | Custom HMAC Bearer tokens (`product-session-service.cjs`); admin gate via `app_users.is_admin` |
| Storage | CloudBase Storage via `@cloudbase/node-sdk`; `storage_path` is canonical and display URLs are derived from the active CDN |
| External sources | USDA FoodData Central, Open Food Facts |
| Image processing | `sharp` when available (optional dependency); graceful fallback to original bytes |

All new tables use **server-only deny-all RLS** (the HTTP function is the sole
reader/writer), matching the existing `food_catalog` / `meal_records` pattern.
No third-party API key or raw source payload ever reaches the mini program.

## Database

### Migration

`cloudbase/pg/migrations/0012_food_catalog_v2.sql` creates:

- `food_categories` (12 seeded: meat, seafood, egg, dairy, soy, grain, vegetable, fruit, beverage, seasoning, mixed_dish, other)
- `food_tags` (6 seeded: high_protein, low_fat, high_carb, low_calorie, plant_protein, high_fiber)
- `foods` (canonical store; unique `(source, source_id)`; unique nullable `fdc_id` / `barcode`; non-negative nutrition checks; trigram + GIN search indexes)
- `food_tag_relations` (composite PK `food_id, tag_id`; `source` = manual | rule)
- `food_images` (unique `content_hash`; one primary per food via partial unique index; `storage_path` is the canonical image address)
- `food_source_payloads` (raw USDA/OFF JSON, server-only)
- `food_sync_jobs` (import/sync audit)
- `food_image_tasks` (async image backfill queue)
- `app_users.is_admin` (admin gate)

It also backfills `foods` from the existing `food_catalog` cache (idempotent).

### Seed

`cloudbase/pg/seeds/0012_food_seed.sql` inserts 50 high-frequency foods as
**fixtures** (`source='fixture'`, `is_verified=false`, `quality_score=30`) using
real USDA reference values. Re-running is idempotent. After configuring
`USDA_FDC_API_KEY`, run `POST /foods/import/usda` to overlay verified USDA
data; fixtures remain as a development fallback and are clearly marked.

### Applying migrations (CloudBase MCP)

```bash
npx mcporter call cloudbase.managePgDatabase \
  --action planMigration --sql "$(cat cloudbase/pg/migrations/0012_food_catalog_v2.sql)"
npx mcporter call cloudbase.managePgDatabase \
  --action applyMigration --sql "$(cat cloudbase/pg/migrations/0012_food_catalog_v2.sql)" --confirm true
npx mcporter call cloudbase.managePgDatabase \
  --action applyMigration --sql "$(cat cloudbase/pg/seeds/0012_food_seed.sql)" --confirm true
```

Promote an admin: `update public.app_users set is_admin = true where id = '<uuid>';`

## Services

| Module | Responsibility |
|--------|-----------------|
| `food-repository.cjs` | Query/upsert foods, categories, tags, images; popularity; missing-images; sync jobs; admin check |
| `usda-service.cjs` | USDA search + detail; nutrient normalization (kJ→kcal, Branded→per100g); Foundation/SR Legacy/FNDDS ranking; raw payload retention |
| `open-food-facts-service.cjs` | Barcode lookup; image priority (selected_images zh/en → small → front); per-100g scaling; attribution + quality scoring |
| `food-normalization-service.cjs` | Name cleaning, search_keywords generation, centralized auto-tag rules, anomaly detection |
| `food-image-service.cjs` | SSRF-safe download (HTTPS + host allow-list + private-IP block + redirect cap), SHA-256 dedup, square crop + thumb/medium/detail WebP, CloudBase upload |
| `food-barcode-service.cjs` | Local-first barcode lookup with per-barcode lock for idempotent OFF enrichment + image sync |
| `food-admin-service.cjs` | Admin-only USDA import (dry-run + idempotent), image sync, review, food patch, set-primary, listings |
| `hunyuan-image-service.cjs` | CloudBase AI `createImageModel("hunyuan-image")` + download temp URL |
| `food-image-job-service.cjs` | Async Hunyuan job queue, approve/reject, daily quota |
| `food-image-prompts.cjs` | ≤500-char Nordic food photography prompts |

See also: [FOOD_IMAGE_GENERATION.md](./FOOD_IMAGE_GENERATION.md) for the Hunyuan batch pipeline.

### Auto-tag rules (centralized in `food-normalization-service.cjs`)

| Tag | Rule |
|-----|------|
| high_protein | protein_g ≥ 15 per 100g |
| low_fat | fat_g ≤ 3 per 100g |
| high_carb | carbs_g ≥ 30 per 100g |
| low_calorie | calories ≤ 100 per 100g |
| high_fiber | fiber_g ≥ 5 per 100g |
| plant_protein | category ∈ {soy, grain} (context-supplied) |

Rule tags use `source='rule'`; manual tags are never overwritten.

## API

All routes are under the `get-login-ticket` HTTP function and require
`Authorization: Bearer <accessToken>` (login-issued). Admin routes additionally
require `app_users.is_admin = true`.

### Public / authenticated

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/foods` | (legacy) USDA-backed search; `query`, `page` |
| GET | `/foods/discover` | (legacy) curated discovery; optional `limit` |
| GET | `/foods/:id` | (legacy) detail by UUID |
| GET | `/foods/categories` | active categories |
| GET | `/foods/tags` | active tags |
| GET | `/foods/suggestions?q=` | local-only suggestions (≤10) |
| GET | `/foods/barcode/:barcode` | local-first, then Open Food Facts, normalize + cache + image sync |
| POST | `/foods/images/upload` | logged-in user candidate upload (status=pending, never primary) |

### Admin only (`/api/admin/...`)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/foods/import/usda` | USDA import; `query`, `dataTypes`, `pageSize`, `maxItems`, `categoryCode`, `dryRun` |
| POST | `/foods/:id/images/sync` | queue image backfill by priority |
| GET | `/api/admin/foods/missing-images` | foods without a primary image |
| GET | `/api/admin/foods/sync-jobs` | sync job history |
| PATCH | `/api/admin/food-images/:id/review` | approve/reject an uploaded image |
| PATCH | `/api/admin/foods/:id` | update food fields |
| POST | `/api/admin/foods/:id/set-primary-image` | set primary image |

### Example: `GET /foods/suggestions?q=chicken`

```json
{
  "items": [
    { "id": "...", "nameZh": "鸡胸肉", "nameEn": "Chicken breast", "brandName": null, "calories": 165, "protein": 31 }
  ]
}
```

### Example: `GET /foods/barcode/5449000000996`

```json
{ "food": { "id": "...", "source": "open_food_facts", "barcode": "5449000000996", "nameEn": "Coca Cola", "nutritionPer100g": { "calories": 42, "protein": 0, "carbs": 10.6, "fat": 0 } }, "source": "open_food_facts" }
```

## Image fallback order

When resolving a food image, the repository returns the first available:

1. Verified primary `food_images` row (`status=ready, is_verified=true, is_primary=true`)
2. Shared `image_entity_key` image
3. Verified Open Food Facts image
4. Verified user-uploaded image
5. Category placeholder
6. Default placeholder

The response marks `isPlaceholder: true` when a placeholder is used. For rows
with `storage_path`, display URLs are generated from `FOOD_IMAGE_CDN_BASE_URL`
and legacy persisted URL fields are not used. External or temporary URLs are
never returned as the canonical image.

## Caching & resilience

- USDA/OFF results are persisted to `foods` + `food_source_payloads` (TTL 86400s for OFF).
- Barcode lookups use a per-instance in-memory lock to prevent concurrent duplicate creation; the DB unique constraint on `barcode` is the durable idempotency guard.
- All third-party calls have timeouts (USDA 7s, OFF 4s, image download 8s) and bounded retries via redirect caps.
- Image enrichment is best-effort and never blocks nutrition responses (mirrors the legacy `food-catalog-service` resilience pattern).
- `sharp` is an optional dependency: when unavailable, the original bytes are stored as the `detail` variant and `thumb`/`medium` are skipped (the image row is still created with `status=ready`).

## Security

- All API keys live only in the cloud function environment; the mini program holds only the HMAC user access token.
- Image downloads enforce HTTPS, a configurable host allow-list, private-IP/localhost blocking, and a 3-redirect cap (SSRF protection).
- User-uploaded images are always `status=pending`, never `is_primary`; only an admin review can promote them.
- Admin routes return 403 for non-admins (verified server-side via `app_users.is_admin`, not by hiding UI).
- Raw USDA/OFF payloads are stored server-side only and never returned to the client.
- Logs never print API keys, access tokens, or full user PII.

## Tests

Backend (Node built-in runner): `node --test cloudbase/functions/get-login-ticket/*.test.mjs`
Schema static checks: `node --test scripts/cloudbase/verify-schema.test.mjs`

Coverage: nutrient mapping, kJ→kcal, Branded scaling, name normalization, auto-tag rules, anomaly detection, OFF mapping + image priority, SSRF host/private-IP rejection, image transform fallback, list filter + pagination, suggestions, barcode cache + concurrency idempotency, admin auth (403), upload perms, schema contracts.

## Environment variables

See `.env.example`. New variables:

```
USDA_FDC_API_KEY=
USDA_API_BASE_URL=https://api.nal.usda.gov/fdc/v1
OPEN_FOOD_FACTS_BASE_URL=https://world.openfoodfacts.org
OPEN_FOOD_FACTS_USER_AGENT=NordicNutriAI/1.0
FOOD_IMAGE_ALLOWED_HOSTS=images.openfoodfacts.org,world.openfoodfacts.org,static.openfoodfacts.org,images-us.openfoodfacts.org
FOOD_IMAGE_MAX_BYTES=10485760
FOOD_IMAGE_STORAGE_BUCKET=food-images
FOOD_SEARCH_CACHE_TTL_SECONDS=300
FOOD_BARCODE_CACHE_TTL_SECONDS=86400
```

## Frontend integration (next step)

The existing `food-catalog-api.ts` (`/foods`, `/foods/discover`) continues to
work unchanged. To adopt the richer model, the frontend can additionally call:

- `GET /foods/categories` and `GET /foods/tags` to replace the client-side `FOOD_CATEGORIES` / `FOOD_TAGS` constants in `food-labels.ts`.
- `GET /foods/suggestions?q=` for search autocomplete (local, no third-party latency).
- `GET /foods/barcode/:barcode` for a future barcode-scan entry point.

The legacy `ProductFoodCatalogItem` shape remains the source of truth for
`/foods` and `/foods/discover`; the new endpoints return their own documented
shapes under `{ items: [...] }`.
