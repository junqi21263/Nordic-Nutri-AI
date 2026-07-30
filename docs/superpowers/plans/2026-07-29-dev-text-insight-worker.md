# Dev Text Insight Worker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route food-detail nutrition insight generation to the dev environment's Mini Program Growth Plan text-token pool.

**Architecture:** Extend the existing HMAC-protected `hunyuan-image-worker` in `dev-d8g3hqv2b0de38046` with a `/nutrition-insight` route that calls the enabled `hunyuan-exp` group. Add a small signed client to the primary `get-login-ticket` function and inject it into the existing food-insight service, preserving its rule-based fallback.

**Tech Stack:** Node.js 18 HTTP functions, `@cloudbase/node-sdk`, HMAC-SHA256, Node test runner, Taro mini program.

---

### Task 1: Dev worker behavior

**Files:**
- Modify: `cloudbase/functions/hunyuan-image-worker/index.js`
- Modify: `cloudbase/functions/hunyuan-image-worker/index.test.mjs`

- [ ] **Step 1: Write the failing worker tests**

Cover a valid signed `POST /nutrition-insight` returning structured insight, an unsigned request returning `401`, and an invalid food context returning `400`, while retaining coverage for the existing `/generate` image route.

- [ ] **Step 2: Run the worker tests to verify they fail**

Run: `node --test cloudbase/functions/hunyuan-image-worker/index.test.mjs`

Expected: FAIL because the text route does not exist.

- [ ] **Step 3: Implement the worker**

Parse JSON up to 8 KiB, verify a five-minute HMAC signature window, validate bounded food facts, call `ai.createModel("hunyuan-exp").generateText(...)`, validate JSON `{ headline, content }`, and return only that result plus model metadata through `/nutrition-insight`.

- [ ] **Step 4: Run the worker tests to verify they pass**

Run: `node --test cloudbase/functions/hunyuan-image-worker/index.test.mjs`

Expected: PASS.

### Task 2: Primary-function signed client

**Files:**
- Create: `cloudbase/functions/get-login-ticket/nutrition-insight-worker-client.cjs`
- Create: `cloudbase/functions/get-login-ticket/nutrition-insight-worker-client.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Modify: `cloudbase/functions/get-login-ticket/index.test.mjs`

- [ ] **Step 1: Write failing client and route tests**

Assert that the client signs the exact JSON body, rejects malformed worker responses, and that food insight uses the dev worker completion while preserving `rule_v1` on worker failure.

- [ ] **Step 2: Run focused tests to verify failure**

Run: `node --test cloudbase/functions/get-login-ticket/nutrition-insight-worker-client.test.mjs cloudbase/functions/get-login-ticket/index.test.mjs`

Expected: FAIL because the client module is absent.

- [ ] **Step 3: Implement signed request delegation**

Derive the text route from the existing server-only `HY_IMAGE_WORKER_ENDPOINT` and reuse `AI_WORKER_SHARED_SECRET` (with optional text-specific overrides). Pass a request-completion function to `createFoodInsightService`; do not modify mini-program credentials or expose the dev endpoint to the client.

- [ ] **Step 4: Run focused tests to verify pass**

Run: `node --test cloudbase/functions/get-login-ticket/nutrition-insight-worker-client.test.mjs cloudbase/functions/get-login-ticket/index.test.mjs`

Expected: PASS.

### Task 3: Deploy and verify both environments

**Files:**
- Modify: dev CloudBase function code for `hunyuan-image-worker`
- Modify: primary CloudBase function code for `get-login-ticket`

- [ ] **Step 1: Confirm dev package and model group readiness**

Call `DescribeEnvPostpayPackage` and `DescribeAIModels` for `dev-d8g3hqv2b0de38046`; require active `hunyuan-exp` and an active free token package.

- [ ] **Step 2: Deploy the dev worker route with the existing server-only HMAC secret**

Update only the code of the existing `hunyuan-image-worker`; do not alter its configuration. Invoke an unsigned `/nutrition-insight` request and require `401`.

- [ ] **Step 3: Deploy primary proxy configuration and code**

Update primary code to derive the dev text endpoint from its existing image-worker endpoint and reuse its existing server-only HMAC secret. Do not change client endpoints, main database configuration, or function secrets.

- [ ] **Step 4: Verify runtime evidence**

Open a logged-in food detail, require a `200` insight response, then query dev `module:llm AND logType:llm-tracelog` for `hunyuan-exp` success and positive token count. Run full function tests, mini-program typecheck, Taro build, and `git diff --check`.
