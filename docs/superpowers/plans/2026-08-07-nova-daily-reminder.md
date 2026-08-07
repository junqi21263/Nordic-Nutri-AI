# NOVA Daily Reminder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a cached, DeepSeek V4 Flash-backed daily nutritional reminder that changes with verified user data and is visible on the Coach page.

**Architecture:** Add an isolated proactive-brief service that validates model output and provides a context-aware rule fallback. Coach data builds and caches the daily brief in a server-only PG table; the HTTP route records non-cached V4 Flash usage with the dedicated observability feature. The mini program retrieves and renders the brief separately from the existing daily-tip card.

**Tech Stack:** Node.js HTTP Cloud Function, CloudBase PG, DeepSeek V4 Flash, Taro/React, TypeScript, Node test runner.

---

### Task 1: Establish the proactive brief contract

**Files:**
- Create: `cloudbase/functions/get-login-ticket/proactive-daily-brief-service.cjs`
- Create: `cloudbase/functions/get-login-ticket/proactive-daily-brief-service.test.mjs`

- [ ] **Step 1: Write failing service tests**

Test that a valid model JSON response preserves all seven display fields and that a fallback for a dairy-avoidance protein gap recommends a non-dairy choice. Test that validation rejects an unrecognised theme and text exceeding the display limit.

- [ ] **Step 2: Run the targeted test**

Run: `node --test cloudbase/functions/get-login-ticket/proactive-daily-brief-service.test.mjs`

Expected: FAIL because the proactive brief service does not exist.

- [ ] **Step 3: Implement the minimal service**

Export `createProactiveDailyBriefService` and `validateProactiveDailyBrief`. Use the explicit seven-theme allow-list, V4 Flash JSON response mode, the approved personality prompt, and deterministic fallbacks driven by `dailyContext`.

- [ ] **Step 4: Re-run the targeted test**

Run: `node --test cloudbase/functions/get-login-ticket/proactive-daily-brief-service.test.mjs`

Expected: PASS.

### Task 2: Build, cache, and expose a daily brief

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/coach-data-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/coach-data-service.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Modify: `cloudbase/functions/get-login-ticket/index.test.mjs`
- Create: `cloudbase/pg/migrations/0040_nova_daily_briefs.sql`
- Create: `cloudbase/pg/migrations/0040_nova_daily_briefs.test.mjs`

- [ ] **Step 1: Write failing context and cache tests**

Use fixture meals and preferences to assert that `getDailyBrief` supplies yesterday completion, journey stage, current meal period, recent themes, and avoidance labels to the generator. Assert same-date same-context requests use the cache and a context change causes a regenerated brief.

- [ ] **Step 2: Run the targeted test**

Run: `node --test cloudbase/functions/get-login-ticket/coach-data-service.test.mjs cloudbase/functions/get-login-ticket/index.test.mjs`

Expected: FAIL because `getDailyBrief` and its route do not exist.

- [ ] **Step 3: Implement backend data flow and migration**

Add a server-only `nova_daily_briefs` table keyed by `(user_id, brief_date)`. Add `getDailyBrief` to coach data, derive the compact context from existing account, daily, weekly and meal data, cache by hash, and route `GET /coach/daily-brief`. Record a successful non-cached model response using `feature: proactive_daily_brief`.

- [ ] **Step 4: Re-run backend tests**

Run: `node --test cloudbase/functions/get-login-ticket/proactive-daily-brief-service.test.mjs cloudbase/functions/get-login-ticket/coach-data-service.test.mjs cloudbase/functions/get-login-ticket/index.test.mjs cloudbase/pg/migrations/0040_nova_daily_briefs.test.mjs`

Expected: PASS.

### Task 3: Render the proactive reminder in the mini program

**Files:**
- Modify: `mini-program/src/api/coach-api.ts`
- Modify: `mini-program/src/pages/coach/index.tsx`
- Modify: `mini-program/src/styles/page.scss`
- Create: `mini-program/tests/coach-proactive-daily-brief.test.ts`

- [ ] **Step 1: Write a failing UI contract test**

Assert the coach page obtains `getProductCoachDailyBrief`, renders the `NOVA · 今日提醒` heading, and displays the API greeting, summary, meal label, suggestion, reason and action rather than a fixed greeting.

- [ ] **Step 2: Run the targeted test**

Run: `pnpm --dir mini-program exec vitest run tests/coach-proactive-daily-brief.test.ts`

Expected: FAIL because the brief API and card rendering do not exist.

- [ ] **Step 3: Implement the API and card**

Add exact TypeScript response types and a coalesced authenticated request. Load it whenever the coach tab becomes visible, keep a safe local fallback for offline use, and render the compact reminder card above the existing daily-tip card without changing the chat composer.

- [ ] **Step 4: Re-run the targeted test**

Run: `pnpm --dir mini-program exec vitest run tests/coach-proactive-daily-brief.test.ts`

Expected: PASS.

### Task 4: Verify and deliver

**Files:**
- Modify: all files above only

- [ ] **Step 1: Run full relevant verification**

Run: `node --test cloudbase/functions/get-login-ticket/*.test.mjs && pnpm --dir mini-program typecheck && pnpm --dir mini-program test:unit && pnpm --dir mini-program build:weapp && pnpm --dir mini-program verify:weapp && git diff --check`

Expected: all commands exit 0.

- [ ] **Step 2: Review CloudBase boundaries**

Check the route remains authenticated, the new PG table has server-only RLS, only non-cached model calls record Token metrics, and no model or secret is placed in mini-program code.

- [ ] **Step 3: Commit the focused change**

Run: `git add cloudbase mini-program docs && git commit -m "feat: add proactive nova daily reminders"`

Expected: a single commit on `main` containing only the daily-reminder feature.
