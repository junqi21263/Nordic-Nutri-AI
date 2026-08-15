# Vision Nutrition Consistency Trace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Emit a bounded, correlated `vision_recognition_trace` metric for each vision request without changing recognition or persistence behavior.

**Architecture:** Capture structured Flash/Plus/selection and nutrition summaries in request-local memory. After persistence resolves, emit one best-effort trace through the existing observability service, using the existing server-computed image SHA and request/analysis identifiers. Trace errors are swallowed.

**Tech Stack:** Node.js CloudBase function, CommonJS services, node:test, existing `ops_metric_events` observability path.

---

### Task 1: Lock the trace contract with focused tests

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/qwen-vision-service.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/vision-data-service.test.mjs`

- [x] **Step 1: Write failing tests for internal structured summaries**

Assert that a Flash-only result exposes trace metadata without changing the public recognition fields, and that a successful Plus result records both pass summaries and `selectedSource: "plus"`.

- [x] **Step 2: Run the focused tests and verify they fail**

Run: `node --test cloudbase/functions/get-login-ticket/qwen-vision-service.test.mjs cloudbase/functions/get-login-ticket/vision-data-service.test.mjs`

Expected: FAIL because trace metadata is not currently produced.

- [x] **Step 3: Add failing tests for correlation and best-effort persistence tracing**

Assert that the trace contains `clientRequestId`, `imageSha256`, `analysisId`, selected nutrition summaries, and that an observability rejection does not reject `analyzeImage`.

- [x] **Step 4: Run the focused tests again and verify the same intended failures**

Run the same command; failures must concern missing trace behavior, not test setup.

### Task 2: Implement bounded trace capture without changing recognition

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/qwen-vision-service.cjs:155-199`
- Modify: `cloudbase/functions/get-login-ticket/vision-data-service.cjs:110-262`

- [x] **Step 1: Add a bounded item-summary helper**

Capture only `name`, `quantityG`, `caloriesPer100g`, `proteinPer100g`, `carbsPer100g`, and `fatPer100g`, capped to the existing maximum item count. Do not include raw model text.

- [x] **Step 2: Return internal model trace metadata alongside the existing selected result**

Record Flash and Plus summaries, validity, attempted/success/skip/fallback fields, and selected source. Keep the existing response fields and selection object unchanged; the caller will consume the internal metadata before returning the public result.

- [x] **Step 3: Capture backfill before/after and source metadata in request-local state**

Use `result.items` as the before snapshot and `backfilledItems` as the after snapshot. Preserve existing `nutritionMode`, `nutritionSource`, and fallback behavior.

- [x] **Step 4: Run the focused tests and verify green**

Run: `node --test cloudbase/functions/get-login-ticket/qwen-vision-service.test.mjs cloudbase/functions/get-login-ticket/vision-data-service.test.mjs`

Expected: PASS, with existing recognition assertions unchanged.

### Task 3: Emit one correlated best-effort trace after persistence

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/vision-data-service.cjs:220-262`
- Modify: `cloudbase/functions/get-login-ticket/observability-service.cjs` only if an existing metric helper requires no behavior change

- [x] **Step 1: Add a trace emitter seam to the vision data service**

Accept the existing observability `recordMetric` callback as an optional dependency. Build one `vision_recognition_trace` payload containing `clientRequestId`, `analysisId`, `imageSha256`, `imagePath`, model summaries, backfill summaries, persistence outcome, and bounded item arrays.

- [x] **Step 2: Emit after successful analysis persistence**

Write the trace only after `ai_analysis` returns its ID, then return the unchanged public result. A metric rejection is caught and logged without changing the result.

- [x] **Step 3: Emit a failure trace when persistence fails**

If persistence fails after the image SHA is known, emit a trace with `analysisId: null` and `persistenceSuccess: false`; preserve the existing public error behavior.

- [x] **Step 4: Run focused tests and verify green**

Run the two focused test files and confirm both success and failure trace paths pass.

### Task 4: Full verification and scope review

**Files:**
- Verify only; no additional source files.

- [x] **Step 1: Run CloudBase vision tests**

Run: `node --test cloudbase/functions/get-login-ticket/*.test.mjs`

- [x] **Step 2: Run mini-program and build gates**

Run: `pnpm --dir mini-program typecheck`, `pnpm --dir mini-program lint`, `pnpm --dir mini-program test:unit`, `pnpm --dir mini-program build:weapp`, and `pnpm --dir mini-program verify:weapp`.

- [x] **Step 3: Check the diff boundary**

Run: `git diff --check` and `git diff --stat`; confirm no prompt, model strategy, nutrition logic, API contract, schema, or client files changed.
