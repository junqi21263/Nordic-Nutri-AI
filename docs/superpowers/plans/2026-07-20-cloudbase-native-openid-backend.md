# CloudBase Native OpenID Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace custom-ticket login and client-side RDB access with native Mini Program OpenID identification and server-side CloudBase PostgreSQL access.

**Architecture:** The Mini Program initializes `wx.cloud` for the explicit CloudBase environment and calls one event function. The function receives trusted OpenID from CloudBase context, maps it to `app_users`, and executes all database actions through a server-only API key. The Mini Program sends only action-specific payloads and never sends a user ID or RDB authorization token.

**Tech Stack:** Taro 4, WeChat Mini Program Cloud APIs, CloudBase Event Function (Node.js 18), `@cloudbase/js-sdk` server adapter, CloudBase PostgreSQL.

---

### Task 1: Provision the trusted server database boundary

**Files:**
- Create: `cloudbase/functions/nordic-api/package.json`
- Create: `cloudbase/functions/nordic-api/index.js`
- Modify: CloudBase function environment for `nordic-api`

- [ ] **Step 1: Create a server-only CloudBase API key**

Run through CloudBase MCP:

```text
manageAppAuth(action="createApiKey", keyType="api_key", keyName="nordic-api-server", expireIn=0)
```

Expected: a new API key is returned once and is stored only as `CLOUDBASE_APIKEY` in the `nordic-api` function environment.

- [ ] **Step 2: Write the failing function tests**

Add tests proving that a request without `OPENID` returns `UNAUTHORIZED`, that a supplied `userId` is ignored, and that the OpenID-derived user is passed to every data operation.

- [ ] **Step 3: Run the tests to verify RED**

Run:

```bash
node --test cloudbase/functions/nordic-api/index.test.mjs
```

Expected: FAIL because the function module does not exist.

- [ ] **Step 4: Implement the event function**

Implement `exports.main = async (event, context) => { ... }`, get `OPENID` from the CloudBase function context, create or find a product user using a server-side `openid_hash`, and route only allow-listed actions.

- [ ] **Step 5: Run the function tests to verify GREEN**

Run:

```bash
node --test cloudbase/functions/nordic-api/index.test.mjs
```

Expected: PASS.

### Task 2: Add an OpenID mapping without exposing OpenID

**Files:**
- Create: `cloudbase/pg/migrations/0006_openid_server_identity.sql`
- Test: `scripts/cloudbase/verify-schema.test.mjs`

- [ ] **Step 1: Write a failing schema assertion**

Assert that `public.app_users` has a unique `openid_hash` column and that raw OpenID is not represented in public product tables.

- [ ] **Step 2: Run schema verification to verify RED**

Run:

```bash
node --test scripts/cloudbase/verify-schema.test.mjs
```

Expected: FAIL because `openid_hash` is absent.

- [ ] **Step 3: Write migration 0006**

Add `openid_hash char(64) unique` to `public.app_users`, and grant no direct client privileges for the mapping column.

- [ ] **Step 4: Apply after dry run through CloudBase MCP**

Run `managePgDatabase(action="planMigration", sql=<0006 SQL>)`, then `managePgDatabase(action="applyMigration", sql=<0006 SQL>, confirm=true)`.

- [ ] **Step 5: Re-run schema verification**

Expected: PASS, and a read-only schema query shows `openid_hash` on `public.app_users`.

### Task 3: Move Mini Program authentication to native CloudBase calls

**Files:**
- Create: `mini-program/src/api/cloudbase-function-api.ts`
- Modify: `mini-program/src/app.tsx`
- Modify: `mini-program/src/api/auth-api.ts`
- Modify: `mini-program/src/auth/session-manager.ts`
- Modify: `mini-program/src/auth/app-auth-bootstrap.ts`
- Test: `mini-program/tests/cloudbase-native-openid-login.test.ts`

- [ ] **Step 1: Write a failing client-boundary test**

Assert that app launch calls `wx.cloud.init` with the explicit environment ID, login calls `wx.cloud.callFunction({ name: "nordic-api", data: { action: "bootstrap" } })`, and login code no longer imports ticket or RDB client helpers.

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
pnpm --dir mini-program exec vitest run tests/cloudbase-native-openid-login.test.ts
```

Expected: FAIL because the client still invokes custom ticket login.

- [ ] **Step 3: Implement the native call boundary**

Add a typed Cloud Function caller, initialize native CloudBase once at launch, and set the local application session from the `bootstrap` response only. Do not expose OpenID, API keys, CloudBase Auth credentials, or database URLs.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run:

```bash
pnpm --dir mini-program exec vitest run tests/cloudbase-native-openid-login.test.ts
```

Expected: PASS.

### Task 4: Move first persisted business flow behind the function boundary

**Files:**
- Create: `mini-program/src/repositories/cloudbase-function-onboarding-repository.ts`
- Modify: `mini-program/src/pages/nutrition-plan/index.tsx`
- Modify: `mini-program/tests/cloudbase-onboarding-repository.test.ts`

- [ ] **Step 1: Write a failing repository test**

Assert `completeOnboarding(input)` sends a single `completeOnboarding` action and never accepts or sends a user ID.

- [ ] **Step 2: Run the focused test to verify RED**

Run:

```bash
pnpm --dir mini-program exec vitest run tests/cloudbase-onboarding-repository.test.ts
```

Expected: FAIL because the page uses the Supabase onboarding repository.

- [ ] **Step 3: Implement the function-backed repository and handler**

Validate all onboarding fields in the function, derive the user from OpenID, and insert/update goal, body profile, preferences, active nutrition plan, and onboarding completion in one server-side transaction or an equivalent safe sequence.

- [ ] **Step 4: Run the focused test to verify GREEN**

Run:

```bash
pnpm --dir mini-program exec vitest run tests/cloudbase-onboarding-repository.test.ts
```

Expected: PASS.

### Task 5: Deploy and verify the real Mini Program flow

**Files:**
- Modify: `cloudbase/functions/nordic-api/*`
- Modify: `mini-program/dist/weapp/*` (generated)

- [ ] **Step 1: Complete deployment prerequisites**

Confirm the event function is not configured as public HTTP access, its function security rule allows Mini Program callers, and `CLOUDBASE_APIKEY` is server-only.

- [ ] **Step 2: Deploy the event function through CloudBase MCP**

Run `manageFunctions(action="createFunction", functionRootPath="/Users/lewis/Documents/Nordic-Nutri-AI/cloudbase/functions", functionPath="nordic-api", ...)` and wait until status is Active.

- [ ] **Step 3: Build and run all checks**

Run:

```bash
pnpm --dir mini-program run test:unit
pnpm --dir mini-program run typecheck
pnpm --dir mini-program run build:weapp
pnpm --dir mini-program run verify:weapp
```

Expected: all tests and checks pass.

- [ ] **Step 4: Validate in WeChat Developer Tools**

Reload the compiled Mini Program, press the login button, confirm the request is a Cloud Function invocation rather than a direct RDB call, and verify the function log records a successful OpenID bootstrap without logging raw OpenID or secrets.
