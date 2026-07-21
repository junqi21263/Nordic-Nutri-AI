# Nordic Nutri AI Complete Product API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace remaining local-only product data paths with authenticated CloudBase HTTPS APIs while preserving the frozen Mini Program UI.

**Architecture:** Extend the existing `get-login-ticket` HTTP function with small services for account/plan data, nutrition insights, coach messages, feedback, and optional vision. Every service receives the authenticated product user ID from the HMAC session and uses the existing server-only CloudBase RDB client. Mini Program pages consume typed API modules and hydrate existing Zustand stores only after server confirmation.

**Tech Stack:** Node.js 18 HTTP CloudBase function, CloudBase PostgreSQL, DeepSeek Chat Completions, Taro React, Zustand, Vitest, Node test runner.

---

### Task 1: Account settings and active nutrition plan

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/product-data-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/product-data-service.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Modify: `cloudbase/functions/get-login-ticket/index.test.mjs`
- Modify: `mini-program/src/api/product-data-api.ts`
- Modify: `mini-program/src/auth/app-auth-bootstrap.ts`
- Test: `mini-program/tests/product-data-https-boundary.test.ts`

- [ ] Write failing tests requiring `/account` to return settings and the active plan, plus authenticated `PATCH /settings` and `PATCH /nutrition-plan` routes.
- [ ] Run the focused Node and Vitest tests and verify the new assertions fail for missing behavior.
- [ ] Implement validated settings upsert, active-plan read and plan version update; never accept a client user ID.
- [ ] Extend the client DTO and bootstrap hydration, then rerun focused tests until green.

### Task 2: Date-range meal reads and authoritative summaries

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/meal-data-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/meal-data-service.test.mjs`
- Create: `cloudbase/functions/get-login-ticket/insight-data-service.cjs`
- Create: `cloudbase/functions/get-login-ticket/insight-data-service.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Modify: `mini-program/src/api/meal-data-api.ts`
- Create: `mini-program/src/api/insight-api.ts`

- [ ] Write failing tests for date-range reads, meal detail, daily summary, weekly review, and achievements.
- [ ] Verify failures are caused by missing methods/routes.
- [ ] Implement bounded date validation, user-scoped reads, daily macro aggregation, seven-day review and deterministic achievements.
- [ ] Add typed clients and rerun focused tests.

### Task 3: Connect Home, Records, Weekly Review, Achievements and Profile

**Files:**
- Modify: `mini-program/src/pages/home/index.tsx`
- Modify: `mini-program/src/pages/meal-records/index.tsx`
- Modify: `mini-program/src/pages/weekly-review/index.tsx`
- Modify: `mini-program/src/pages/achievements/index.tsx`
- Modify: `mini-program/src/pages/profile/index.tsx`
- Modify: `mini-program/src/stores/daily-nutrition-store.ts`
- Modify: `mini-program/src/stores/achievement-store.ts`
- Test: `mini-program/tests/coach-profile.test.ts`
- Test: `mini-program/tests/p0-p1-interaction-completion.test.ts`

- [ ] Add failing tests proving the pages call authenticated insight APIs and no longer label cloud-backed data as device-only.
- [ ] Verify the tests fail before page edits.
- [ ] Hydrate existing stores from the new DTOs without changing layout or styling.
- [ ] Verify page tests and existing visual contract tests pass.

### Task 4: Persistent DeepSeek coach

**Files:**
- Create: `cloudbase/functions/get-login-ticket/coach-service.cjs`
- Create: `cloudbase/functions/get-login-ticket/coach-service.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Create: `mini-program/src/api/coach-api.ts`
- Modify: `mini-program/src/pages/coach/index.tsx`
- Modify: `mini-program/src/stores/coach-store.ts`
- Test: `mini-program/tests/coach-profile.test.ts`

- [ ] Write failing service tests for user-scoped history, bounded messages, context minimization, saved user/assistant messages and rule fallback.
- [ ] Verify the service and page tests fail for missing coach API behavior.
- [ ] Implement `GET /coach/messages` and `POST /coach-answer`, using DeepSeek when configured and deterministic nutrition advice on provider failure.
- [ ] Connect the existing chat UI and suggested-snack action to server APIs, then rerun tests.

### Task 5: Feedback persistence

**Files:**
- Create: `cloudbase/functions/get-login-ticket/feedback-service.cjs`
- Create: `cloudbase/functions/get-login-ticket/feedback-service.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Create: `mini-program/src/api/feedback-api.ts`
- Modify: `mini-program/src/pages/profile/index.tsx`
- Create: `cloudbase/pg/migrations/0009_product_api_completion.sql`
- Modify: `scripts/cloudbase/verify-schema.test.mjs`

- [ ] Write failing tests for authenticated feedback submission and schema presence.
- [ ] Verify the tests fail for the missing table/service.
- [ ] Add `user_feedback` with indexes, RLS deny-by-default and server-only grants; implement a 1-1200 character write boundary.
- [ ] Connect the existing feedback sheet without changing its UI and rerun tests.

### Task 6: Optional real image-recognition boundary

**Files:**
- Create: `cloudbase/functions/get-login-ticket/vision-service.cjs`
- Create: `cloudbase/functions/get-login-ticket/vision-service.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Create: `mini-program/src/api/vision-api.ts`
- Modify: `mini-program/src/pages/food-scanner/index.tsx`
- Modify: `mini-program/src/stores/scanner-store.ts`

- [ ] Write failing tests for authenticated image analysis, MIME/size validation and explicit unconfigured-provider errors.
- [ ] Verify failures occur before implementation.
- [ ] Implement a provider-injected vision boundary. Do not call the DeepSeek text endpoint with image data and do not persist base64 payloads.
- [ ] Connect scanner state to the endpoint while preserving the existing manual candidate fallback only when the user explicitly chooses manual entry.

### Task 7: Full verification and controlled deployment

**Files:**
- Modify: `docs/API_CONTRACT.md`
- Modify: `docs/AUTH_FLOW.md` if the runtime contract changed.

- [ ] Run all function tests, all Mini Program tests, typecheck, WeChat build, WXSS verification, schema verification and `git diff --check`.
- [ ] Scan tracked source and build output for Supabase runtime calls and secret-shaped values.
- [ ] Apply migration `0009` through the CloudBase PostgreSQL management surface and verify the new table/indexes.
- [ ] Before deployment, confirm `CLOUDBASE_APIKEY`, session/login secrets, DeepSeek key, public HTTP permission and the existing 30-second function timeout without printing secret values.
- [ ] Deploy function code only after the deployment gate is reconfirmed; then verify Active/Available and perform unauthenticated 401 probes.
- [ ] Complete authenticated acceptance in WeChat Developer Tools: login, account hydration, settings/plan edits, meal CRUD, daily/weekly/achievement reads, coach reply, feedback, and vision behavior.
