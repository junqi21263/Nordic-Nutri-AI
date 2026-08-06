# P1/P2 Review Remediation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the review P2 lint/deployment drift and close the P1 admin-login, account-cancellation, and deletion-audit reliability gaps without deploying production resources.

**Architecture:** The admin login service will consume a PostgreSQL-backed, privacy-preserving attempt key before password verification so all function instances share one atomic quota. Account cancellation will become fail-closed at the file-enumeration and storage-cleanup boundaries; account and database rows remain intact on a cleanup error. The existing signed purge dispatcher will additionally invoke a server-only audit-retention method, while a migration defines the durable state and 30-day expiry index.

**Tech Stack:** Node.js CloudBase HTTP functions, CloudBase PostgreSQL migrations, Taro/React TypeScript, node:test, ESLint, Taro build.

---

### Task 1: P2 type and deployment manifest coverage

**Files:**
- Modify: `mini-program/src/pages/food-detail/index.tsx:1-140`
- Modify: `cloudbaserc.json:1-55`
- Create: `scripts/verify-cloudbase-function-manifest.test.mjs`

- [ ] **Step 1: Write failing checks**

```js
assert.match(await readFile("cloudbaserc.json", "utf8"), /"name": "hunyuan-image-worker"/);
```

and run ESLint so the two `no-explicit-any` diagnostics are reproduced.

- [ ] **Step 2: Run the checks and verify red**

Run: `node --test scripts/verify-cloudbase-function-manifest.test.mjs && pnpm --dir mini-program lint`

Expected: manifest assertion and two explicit-`any` lint errors fail.

- [ ] **Step 3: Implement the minimum change**

```ts
type TouchPoint = { clientX: number; clientY: number };
type TouchEvent = { touches?: TouchPoint[]; changedTouches?: TouchPoint[] };
```

Use `unknown` plus a structural type guard in the JSX-compatible handlers. Add the existing `hunyuan-image-worker` with its HTTP handler and dependency install setting to the manifest.

- [ ] **Step 4: Run green checks**

Run: `node --test scripts/verify-cloudbase-function-manifest.test.mjs && pnpm --dir mini-program lint`

Expected: both exit 0.

### Task 2: P1 durable admin login quota

**Files:**
- Create: `cloudbase/pg/migrations/0036_p1_auth_and_deletion_retention.sql`
- Create: `cloudbase/pg/migrations/0036_p1_auth_and_deletion_retention.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/admin-console-auth-service.cjs:1-150`
- Modify: `cloudbase/functions/get-login-ticket/admin-console-auth-service.test.mjs:1-120`
- Modify: `cloudbase/functions/get-login-ticket/index.js:1000-1015`

- [ ] **Step 1: Write failing tests**

```js
await assert.rejects(
  () => service.login({ username: "ops", password: "wrong" }),
  (error) => error.code === "ADMIN_AUTH_INVALID",
);
assert.deepEqual(consumedKeys, [expectedHashedAttemptKey]);
```

The migration test requires a private quota table keyed by a SHA-256 attempt key and a `security definer` atomic consume function that is executable only by `service_role`.

- [ ] **Step 2: Run red tests**

Run: `node --test cloudbase/functions/get-login-ticket/admin-console-auth-service.test.mjs cloudbase/pg/migrations/0036_p1_auth_and_deletion_retention.test.mjs`

Expected: failures because the in-memory interface has no async persistent consume and migration does not exist.

- [ ] **Step 3: Implement the minimum change**

```js
const result = await db.rpc("consume_admin_login_attempt", {
  p_attempt_key: attemptKey,
  p_limit: ADMIN_LOGIN_MAX_FAILURES,
  p_window_seconds: ADMIN_LOGIN_WINDOW_MS / 1000,
});
if (result.error || result.data?.[0]?.allowed !== true) throw new PublicAdminAuthError("ADMIN_AUTH_RATE_LIMITED");
```

Hash the normalized username with `identityPepper`; consume before comparing the configured password, clear on successful authentication, and return a configuration-safe auth failure when the durable dependency is unavailable.

- [ ] **Step 4: Run green tests**

Run: `node --test cloudbase/functions/get-login-ticket/admin-console-auth-service.test.mjs cloudbase/pg/migrations/0036_p1_auth_and_deletion_retention.test.mjs`

Expected: all pass.

### Task 3: P1 fail-closed account cancellation and retention purge

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/account-deletion-service.cjs:35-150`
- Modify: `cloudbase/functions/get-login-ticket/account-deletion-service.test.mjs:1-220`
- Modify: `cloudbase/functions/get-login-ticket/observability-service.cjs:330-375`
- Modify: `cloudbase/functions/get-login-ticket/observability-service.test.mjs:1-230`
- Modify: `cloudbase/functions/get-login-ticket/index.js:1235-1265,1558-1575`
- Modify: `cloudbase/functions/vision-image-purge-dispatcher/index.js:1-65`
- Create: `cloudbase/functions/vision-image-purge-dispatcher/index.test.mjs`
- Modify: `mini-program/src/api/product-data-api.ts:40-75`
- Modify: `mini-program/src/pages/account-cancellation/index.tsx:15-42`

- [ ] **Step 1: Write failing tests**

```js
await assert.rejects(() => service.cancelAccount(userId, validInput),
  (error) => error.code === "ACCOUNT_CANCELLATION_STORAGE_CLEANUP_FAILED");
assert.deepEqual(events, []);
```

Add cases for lookup errors (except confirmed missing-table errors), dispatch payload retention flag, and the audit service deleting rows whose `expires_at` is due.

- [ ] **Step 2: Run red tests**

Run: `node --test cloudbase/functions/get-login-ticket/account-deletion-service.test.mjs cloudbase/functions/get-login-ticket/observability-service.test.mjs cloudbase/functions/vision-image-purge-dispatcher/index.test.mjs`

Expected: old behavior deletes the user after storage failure and dispatcher payload omits audit cleanup.

- [ ] **Step 3: Implement the minimum change**

```js
throw new PublicAccountDeletionError(
  "ACCOUNT_CANCELLATION_STORAGE_CLEANUP_FAILED",
  "文件清理失败，账号尚未注销，请稍后重试",
);
```

Only ignore a known missing optional table; propagate all other lookup failures. Add `expires_at` with a 30-day default and index in migration 0036; the signed internal purge request calls `purgeExpiredDeletionLogs` after vision retention. Remove `storageCleanupSkipped` from the product-data API type and only display success after `{ deleted: true }`.

- [ ] **Step 4: Run green tests**

Run: `node --test cloudbase/functions/get-login-ticket/account-deletion-service.test.mjs cloudbase/functions/get-login-ticket/observability-service.test.mjs cloudbase/functions/vision-image-purge-dispatcher/index.test.mjs`

Expected: all pass.

### Task 4: Full verification and review

**Files:**
- Verify only: all files above

- [ ] **Step 1: Run focused tests and static checks**

Run: `pnpm run check && pnpm run typecheck:mini-program && pnpm --dir mini-program lint && pnpm --dir mini-program test:unit && pnpm --dir mini-program build:weapp && pnpm --dir mini-program verify:weapp && node --test cloudbase/functions/get-login-ticket/*.test.mjs cloudbase/pg/migrations/*.test.mjs cloudbase/functions/vision-image-purge-dispatcher/*.test.mjs scripts/verify-cloudbase-function-manifest.test.mjs`

Expected: all commands exit 0.

- [ ] **Step 2: Review deployment boundary**

Do not run migrations or deploy functions. Report the exact affected resources (`get-login-ticket`, `vision-image-purge-dispatcher`, `hunyuan-image-worker`, PostgreSQL migration 0036) and request a separate production confirmation.
