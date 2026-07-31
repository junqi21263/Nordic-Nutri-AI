# Meal Insight + Catalog Ingredient Link Design

Date: 2026-07-30  
Status: approved (product decisions locked)

## Goals

1. Meal-detail「营养小结」shows DeepSeek-backed copy (not the hard-coded sync placeholder).
2. Meal-detail「这餐包含」thumbnails use food-catalog images.
3. Ingredient-detail: remove page title「食材详情」, enlarge「本餐食材」, use catalog image + catalog nutrition insight for「食材建议」.
4. On meal save, missing ingredients are added to the food catalog with DeepSeek category classification.

## Product decisions

| Topic | Choice |
|-------|--------|
| Meal insight timing | Prefer existing `ai_analysis.advice`; else generate once and cache |
| When to upsert foods | On meal create/update (save path) |
| New food images | Placeholder now; enqueue existing async image pipeline |
| Name matching | Normalized exact match on `foods.name_zh` (trim / full-width / case) |
| Implementation style | Thin-slice on existing save/read path (not full async worker platform, not client orchestration) |

## Out of scope

- Fuzzy / alias matching
- Synchronous image generation on save
- Regenerating meal insight on every detail open
- Changing nutrition-composition bars or bottom action bar
- Switching food-insight provider from current worker path to DeepSeek (ingredient advice reuses `GET /foods/:id/insight`)

## Backend

### Migration

- Add nullable `meal_items.food_id uuid references public.foods(id) on delete set null`
- Index on `meal_items.food_id`
- Backfill not required for old rows

### Meal insight

- Extend meal DTO with `insight: string | null`
- On create/update (and GET mapping):
  1. If meal linked to `ai_analysis` with non-empty `advice` → use it as `insight`
  2. Else generate via DeepSeek meal-insight prompt (meal name, items, macros, optional daily context if cheap to load) → persist on meal record **or** reuse `ai_analysis.advice` row; prefer a dedicated nullable `meal_records.insight` column if no analysis row exists
- `mapProductMeal` / client mapper must stop hardcoding `"已同步到你的饮食记录。"`

Recommended persistence: add `meal_records.insight text` so manually created meals without analysis still cache the generated text.

### Resolve / create foods on save

For each meal item:

1. Normalize name → exact match active `foods.name_zh`
2. If found → set `food_id`
3. If missing:
   - Call DeepSeek classifier: input `{ name, calories/protein/carbs/fat per 100g }` → output one of existing `food_categories.code`
   - `upsert`/insert `foods` with `source = 'ai_scan'`, macros from item per-100g, `category_id` from code, `image_status = pending` (or equivalent)
   - Enqueue existing food-image job / batch hook if available; otherwise leave pending for admin pipeline
   - Set `meal_items.food_id`

Failures in classify/create must not fail the whole meal save: fall back to `food_id = null` and placeholder image; log warning.

### Meal DTO items

Each item returns:

- existing nutrition fields
- `foodId: string | null`
- `imageUrl: string | null` (catalog primary thumb/list URL when ready)

## Frontend

### Types / mapper

- `Meal.insight` from server
- `MealItem.foodId?`, `MealItem.imageUrl?`
- Remove hard-coded insight in `product-meal-mapper.ts`

### Meal detail

- 「营养小结」content = `meal.insight` (loading/empty fallback copy if null)
- Ingredient row thumb = `item.imageUrl` or shared placeholder (not meal hero photo for every row)

### Ingredient detail

- Remove centered「食材详情」page title text
- Enlarge「本餐食材」eyebrow/label
- Hero image from `item.imageUrl` / catalog fetch by `foodId`
- 「食材建议」: if `foodId`, call `getProductFoodInsight(foodId)`; else keep short local fallback until food is linked

## Acceptance

1. After saving a scanned/manual meal that had DeepSeek advice, meal detail shows that advice (or freshly generated text), never only「已同步到你的饮食记录。」
2. Ingredient rows show distinct catalog images when foods exist/ready; otherwise placeholder.
3. Ingredient detail matches UI notes and shows catalog insight when `foodId` present.
4. Saving a meal with a novel ingredient name creates a `foods` row (`ai_scan`), assigns a category code, links `food_id`, and does not block save if image job is pending.
5. Existing meals without `food_id` still render; no crash.

## Primary files

- `cloudbase/pg/migrations/0027_meal_items_food_id.sql` (number may shift)
- `cloudbase/functions/get-login-ticket/meal-data-service.cjs`
- New helper: food resolve/classify (DeepSeek)
- `mini-program/src/features/meals/product-meal-mapper.ts`
- `mini-program/src/pages/meal-detail/index.tsx`
- `mini-program/src/pages/ingredient-detail/index.tsx`
- Related unit/contract tests
