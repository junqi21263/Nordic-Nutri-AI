# Dev Free Token Coach Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route the three fixed nutrition-content features to dev's Growth Plan text-token model without weakening session, signing, or fallback behavior.

**Architecture:** The existing dev `hunyuan-image-worker` gains three signed JSON routes. The main `get-login-ticket` function extends its server-only worker client and injects route-specific completion functions into the existing daily-insight and daily-tip services. Existing validators and rule fallbacks remain the final response boundary.

**Tech Stack:** Node.js 18 CloudBase HTTP Functions, `@cloudbase/node-sdk`, HMAC-SHA256, Node test runner.

---

### Task 1: Dev fixed-content routes

**Files:**
- Modify: `cloudbase/functions/hunyuan-image-worker/index.js`
- Modify: `cloudbase/functions/hunyuan-image-worker/index.test.mjs`

- [ ] **Step 1: Add failing signed-route tests**

Add three tests that send correctly signed requests to `/daily-insight`, `/daily-tip`, and `/coach-quick-prompt`, and assert each invokes the matching service method and returns its structured JSON.

- [ ] **Step 2: Run the focused test file**

Run: `node --test cloudbase/functions/hunyuan-image-worker/index.test.mjs`

Expected: FAIL with `405` because the three routes are not recognized.

- [ ] **Step 3: Implement strict route dispatch**

Add `generateDailyInsight({ date, context })`, `generateDailyTip({ type, context })`, and `generateCoachQuickPrompt({ context })` to the worker service. Reuse the existing HMAC verifier and only allow their exact JSON schemas and prompts. All calls use `hunyuan-exp` and the existing configured text model.

- [ ] **Step 4: Re-run focused tests**

Run: `node --test cloudbase/functions/hunyuan-image-worker/index.test.mjs`

Expected: PASS.

### Task 2: Main signed client and service wiring

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/nutrition-insight-worker-client.cjs`
- Modify: `cloudbase/functions/get-login-ticket/nutrition-insight-worker-client.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Modify: `cloudbase/functions/get-login-ticket/index.test.mjs`

- [ ] **Step 1: Add failing client and integration tests**

Assert that each client method signs a request to its fixed dev route and that runtime construction injects the worker into daily insight and daily tip services instead of direct `hy3` or DeepSeek callers.

- [ ] **Step 2: Run focused tests**

Run: `node --test cloudbase/functions/get-login-ticket/nutrition-insight-worker-client.test.mjs cloudbase/functions/get-login-ticket/index.test.mjs`

Expected: FAIL because the extra client methods and runtime injections do not exist.

- [ ] **Step 3: Implement minimal server-only delegation**

Extend the existing client with `generateDailyInsight`, `generateDailyTip`, and `generateCoachQuickPrompt`. Derive the dev base from the existing image worker endpoint; pass completions to `createDailyInsightService` and `createDailyTipService`; set their returned source/model metadata to `hunyuan-exp` and the worker model.

- [ ] **Step 4: Re-run focused tests**

Run: `node --test cloudbase/functions/get-login-ticket/nutrition-insight-worker-client.test.mjs cloudbase/functions/get-login-ticket/index.test.mjs`

Expected: PASS.

### Task 3: Regression, deployment and runtime evidence

**Files:**
- Modify: deployed dev `hunyuan-image-worker`
- Modify: deployed main `get-login-ticket`

- [ ] **Step 1: Run all Cloud Function tests**

Run: `node --test cloudbase/functions/get-login-ticket/*.test.mjs cloudbase/functions/hunyuan-image-worker/index.test.mjs`

Expected: PASS.

- [ ] **Step 2: Deploy dev using the current remote package as the base**

Download dev `hunyuan-image-worker`, compare its `index.js`, overlay only the reviewed route code, then use `manageFunctions(action="updateFunctionCode")`. Verify an unsigned new route returns `401`.

- [ ] **Step 3: Deploy main using the current remote package as the base**

Download main `get-login-ticket`, overlay only the reviewed client and runtime code, then use `manageFunctions(action="updateFunctionCode")`. Verify an unauthenticated public endpoint remains `401`.

- [ ] **Step 4: Verify build and dev model logs**

Run `pnpm run typecheck:mini-program`, `pnpm --dir mini-program build:weapp`, and `git diff --check`. Trigger each feature in the mini program and query dev `module:llm AND logType:llm-tracelog`; require successful `hunyuan-exp` records.
