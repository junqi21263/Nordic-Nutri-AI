# Food Image Prompt Precision (P0 + P1)

**Date:** 2026-07-31  
**Status:** Draft for review  
**Scope:** Improve batch / job Hunyuan food-photo prompts for accuracy (right food), state fidelity (raw vs cooked), composition purity (no sides/sauce), and style stability — within the official **500-character** prompt limit.  
**Out of scope (P2):** Reference-image few-shot, full-catalog vision QA, mini-program UI changes.

## Problem

Admin batch generation (`food-image-batches` → jobs → Hunyuan) still fails in four recurring ways:

1. **Wrong identity** — e.g. shellfish rendered as fish, tofu as meat.
2. **Wrong doneness** — raw vs cooked_plain / cooked_grilled mixed.
3. **Composition pollution** — sauces, sides, platters, packaging, text.
4. **Style drift** — lighting / tableware inconsistent across a batch.

Current assembly lives in `food-image-prompts.cjs` (+ visual profiles in `food-image-visual-profile.cjs`). It already has category templates, cooking hints, `image_subject_zh`, and reject→retry text — but matching is name-regex-first, truncation is naive `slice`, and reject reasons are free-form only.

## Goals

| Goal | Measure |
|------|---------|
| Precise | Same food + same visual profile yields the correct edible subject class |
| Stable | Style clause is fixed; same inputs → same prompt structure |
| Accurate | Prompt still contains identity + state + negatives after budget cut |
| Operable | Reviewers can reject with coded reasons; ops can bulk-fill hard subjects |

## Non-goals

- Raising the 500-char API limit or switching models.
- Automatic vision re-score on every generated image (P2).
- Rewriting the entire admin console shell.
- Changing CDN / storage / approve persistence paths.

## Architecture

```text
food row (+ category.code, image_subject_zh, visual_profile)
        │
        ▼
buildFoodImagePromptPlan  ──►  ordered slots  ──►  budget trim  ──►  prompt ≤ 500
        ▲                                              │
        │                                              ▼
reject reason codes / retryReason              food_image_jobs.prompt
        │
        ▼
admin reject UI (P1) + optional SQL/script for image_subject_zh (P1)
```

Keep a single builder (`buildFoodImagePromptPlan` / `buildFoodImagePrompt`). Batch create already snapshots `prompt_plan_json`; after this work, plan JSON should expose slot metadata for debugging (template id, profile key, truncated flags).

---

## P0 — Prompt engine (ship first)

### P0.1 Slot assembly + priority trim

Assemble prompts as ordered slots (join with `。`):

| Order | Slot | Content | Truncate priority |
|------:|------|---------|-------------------|
| 1 | identity | `真实可食用健康食物摄影，主体：{zh}` + optional short EN | Never drop; clamp names |
| 2 | class | `视觉分类：{label}` from template / category | High keep |
| 3 | subject | `image_subject_zh` **or** template raw/cooked/subject | High keep |
| 4 | state | visual-profile hint + cooking hint (mutex by profile) | High keep |
| 5 | correction | `根据审核反馈修正：…` from reject / extra | Medium-high keep |
| 6 | negatives | template negative + global bans | Medium keep |
| 7 | serving | optional portion text | Low keep |
| 8 | style | **fixed** Nordic style string (short) | Drop first |

**Budget algorithm:** Build full string; while `length > 500`, drop/shorten from the lowest-priority remaining slot (style → serving → shorten negatives → shorten correction → shorten subject). Identity must remain. Never end mid-slot without a closing `。`.

**Style token (fixed, not free-form):**

```text
北欧自然光，浅米白桌面，浅木色餐具，低饱和，主体居中，轻微虚化，4:3
```

No per-batch style overrides in P0/P1.

### P0.2 Template resolution: category code first

Today `resolveFoodPhotoTemplate` matches only on `nameZh + nameEn + category name` regex.

**New order:**

1. Map `food.category.code` (and dotted parents, e.g. `seafood.shellfish`) → template id when known.
2. Else name/category-label regex (existing `PHOTO_TEMPLATES`, keep shellfish before generic seafood).
3. Else `general_food`.

Pass `categoryCode` into the builder from batch/job services (already have `food.category` on getFoodById).

### P0.3 Stronger mutual exclusion negatives

Tighten negatives for high-confusion templates (examples, exact copy in implementation):

- Shellfish / crustacean / cephalopod: explicit 「不是鱼类」+ ban sushi/lemon/sauce.
- Meat poultry: ban rice/veg platter/BBQ char/other meats.
- Plant protein: ban meat/grain bowls.
- Egg/dairy: ban meat/cereal/fruit dessert.
- Vegetable / fruit: ban mixed salad / juice / dessert.

Raw vs cooked subjects already exist for some templates; ensure meat/seafood templates gain short `rawSubject` / `cookedSubject` where missing so profile switching is not only a cooking-hint change.

### P0.4 State mutex

When `visualProfileKey` is `raw` | `cooked_plain` | `cooked_grilled` | `fresh` | `dry`:

- Use the matching subject branch.
- Do **not** append conflicting cooking hints (e.g. no `烤` hint under `raw`).
- If batch requests an explicit profile, that wins over food default / name inference (already true via `resolveVisualProfile`; keep and test).

### P0.5 Tests (P0)

Extend `food-image-prompts.test.mjs`:

- Budget trim drops style before correction / identity.
- Category code `seafood` + name 「海螺」 still selects shellfish template even if category name is wrong.
- `raw` prompt does not contain grilled/roasted cooking hints.
- Output always `≤ 500` and includes 主体 name.

---

## P1 — Ops loop (with P0 plan; implement after P0 green)

### P1.1 Reject reason codes

Define a small closed set stored on reject and folded into the next prompt:

| Code | Label (UI) | Prompt fragment (Chinese, short) |
|------|------------|----------------------------------|
| `wrong_identity` | 认错食材 | 必须严格符合该食材形态，勿生成其他品类 |
| `wrong_doneness` | 生熟错误 | 严格按指定生熟状态，勿混用生鲜与熟制特征 |
| `extra_foods` | 多余配菜/拼盘 | 仅单一主体，勿增加配菜拼盘或其他食物 |
| `sauce_or_seasoning` | 酱汁/调味过重 | 无浓酱无油炸无多余调味 |
| `style_off` | 风格不符 | 保持北欧自然光与浅色桌面，低饱和 |
| `other` | 其他 | free-text only (existing behavior) |

API: `POST /api/admin/food-images/:id/reject` accepts optional `reasonCode` + optional `reason` text.  
Builder joins: coded fragment + free text into slot 5 (`correction`), clamped.

Admin UI (`food-images.html`): reject dialog/prompt replaced or augmented with code chips + optional note (keep keyboard-simple: chips + short text).

### P1.2 Bulk `image_subject_zh` for hard foods

- Keep editing one food in admin food editor (already exists).
- Add a **read-only ops helper** in admin System Config (or docs + SQL script under `cloudbase/pg/scripts/`): list foods missing `image_subject_zh` in categories with high reject rates / shellfish & meat codes.
- Optional: `GET /api/admin/foods?missingImageSubject=1&categoryCode=…` filter for that list (thin; reuse admin foods list if cheaper).

No LLM auto-write of subjects in P1 — humans or curated SQL (pattern already used in `0024_correct_shellfish_taxonomy.sql`).

### P1.3 Reject analytics (lightweight)

- On reject, persist `reason_code` on the image or job row (migration if column missing).
- Admin batch inspector or stats endpoint: counts by reason code for last N days / active batch — enough to drive which subjects to fill next.

If schema change is heavy, P1.3 may store code inside existing `reject_reason` / `extra_prompt` prefix `code:wrong_identity|…` for v1 and migrate later — prefer a real column when touching migrations anyway.

### P1.4 Tests (P1)

- Reject with `reasonCode` produces correction slot containing the fragment.
- Free-text `other` still works.
- Admin HTML test asserts reason-code UI markers exist.

---

## Data / API impact

| Area | Change |
|------|--------|
| `food-image-prompts.cjs` | Slots, trim, categoryCode, stronger templates |
| `food-image-job-service.cjs` / batch service | Pass `categoryCode`; forward `reasonCode` into prompt plan |
| Reject API | `reasonCode` optional |
| PG | Optional `food_images.reject_reason_code` (or job field) |
| `food-images.html` | Reject reason chips; optional missing-subject filter |
| Docs | Update `FOOD_IMAGE_GENERATION.md` prompt section |

## Rollout

1. Implement + unit-test P0; deploy `get-login-ticket`.
2. Smoke: diagnose + 1 shellfish cooked + 1 meat raw batch item; confirm prompt in inspector.
3. Implement P1 reject codes + UI; deploy function + hosting HTML.
4. Fill `image_subject_zh` for Top confused foods from reject stats / known shellfish set.
5. P2 later if still unstable on hard classes.

## Risks

| Risk | Mitigation |
|------|------------|
| Trim removes useful negatives | Prefer shortening negatives over dropping identity/state; tests for shellfish |
| Category code map incomplete | Fall back to regex; expand map from real taxonomy codes |
| Reviewers ignore codes | Default chip preselected from last filter; free text still allowed |
| Batches snapshot old `prompt_plan_json` | New jobs only; regenerating / reject-retry rebuilds prompt |

## Success criteria

- Prompt builder tests green; all prompts `≤ 500` with identity retained under stress fixtures.
- Manual: 熟海螺 / 鸡胸肉 raw / 豆腐 batch samples show correct class language in inspector.
- After 1 week of coded rejects: ops can name Top 3 failure codes and backfill subjects for those classes.

## Implementation phases (for the plan doc)

1. P0 slots + trim + tests  
2. P0 category-code resolution + template negatives / raw-cooked subjects  
3. P1 reject reason codes (API + builder + migration if needed)  
4. P1 admin UI chips + hosting deploy  
5. P1 missing-subject list helper / script + short doc update  
