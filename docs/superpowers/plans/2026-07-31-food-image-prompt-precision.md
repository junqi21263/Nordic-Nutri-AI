# Food Image Prompt Precision Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Hunyuan batch food prompts more precise and stable via slot-based assembly, category-code template matching, reject reason codes, and ops backfill for `image_subject_zh`.

**Architecture:** Keep `food-image-prompts.cjs` as the single builder. Assemble fixed priority slots and trim from the bottom when over 500 chars. Resolve templates by `category.code` first, then name regex. Reject API accepts `reasonCode`; coded fragments fold into the correction slot and batch retry path already passes `retry_reason` → `extraPrompt`.

**Tech Stack:** Node.js CommonJS cloud function, `node:test`, CloudBase PG, static admin HTML.

**Spec:** `docs/superpowers/specs/2026-07-31-food-image-prompt-precision-design.md`

---

## File map

| File | Role |
|------|------|
| `food-image-prompts.cjs` | Slots, trim, category-code map, reject fragments |
| `food-image-prompts.test.mjs` | P0/P1 prompt tests |
| `food-image-job-service.cjs` | Pass categoryCode; accept reasonCode on reject |
| `food-image-job-service.test.mjs` | Reject code → retry_reason |
| `food-image-batch-service.cjs` | Pass categoryCode into plan |
| `index.js` | Forward reasonCode on reject route |
| `food-repository.cjs` | Optional `missingImageSubject` admin filter |
| `0029_food_image_reject_reason_code.sql` | Column + check |
| `food-images.html` / `.test.mjs` | Reject chips + missing-subject filter |
| `FOOD_IMAGE_GENERATION.md` | Document prompt slots + codes |
| `cloudbase/pg/scripts/list-missing-image-subjects.sql` | Ops SQL helper |

---

### Task 1: P0 slot trim + style last

**Files:** `food-image-prompts.cjs`, `food-image-prompts.test.mjs`

- [x] Failing tests: trim drops style before correction; always ≤500 with 主体
- [x] Implement slot builder + priority trim
- [x] Pass tests; deploy

### Task 2: P0 category code + stronger templates

**Files:** same + batch/job callers for `categoryCode`

- [x] Failing tests: wrong category name + code/seafood+海螺 → shellfish; raw excludes 烤
- [x] Code map + raw/cooked subjects + stronger negatives
- [x] Pass `categoryCode` from batch/job; deploy

### Task 3: P1 reject reason codes

**Files:** prompts, job service, index, migration 0029, tests

- [x] Failing tests for reasonCode fragment in correction / retry_reason
- [x] `REJECT_REASON_CODES`, reject API, optional column
- [x] Deploy (apply `0029_food_image_reject_reason_code.sql` in PG)

### Task 4: P1 admin UI + missing subject ops

**Files:** `food-images.html`, tests, SQL script, docs

- [x] Reject chips + optional note
- [x] Admin foods filter `missingImageSubject` or SQL script
- [x] Update FOOD_IMAGE_GENERATION.md; deploy function + hosting

---
