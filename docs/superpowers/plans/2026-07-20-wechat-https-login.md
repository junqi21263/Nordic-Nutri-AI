# WeChat HTTPS Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the unavailable `wx.cloud` PG-environment login path with `wx.login()` plus an HTTPS CloudBase function that maps a verified WeChat OpenID to a product user.

**Architecture:** The Mini Program sends a one-time `wx.login` code only to the existing CloudBase HTTP function. The function exchanges it with WeChat using server-only credentials, hashes the returned OpenID, reads/writes CloudBase PostgreSQL with a server-only API key, and returns an HMAC-signed business session. No CloudBase custom ticket, client RDB access, raw OpenID, or secret reaches the Mini Program.

**Tech Stack:** Taro 4, WeChat `wx.login`, CloudBase HTTP Function (Node.js 18), CloudBase JS SDK v3 PostgreSQL, Node `https` and `crypto`.

---

### Task 1: Replace the ticket issuer with a product-session service

**Files:**
- Create: `cloudbase/functions/get-login-ticket/product-session-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Modify: `cloudbase/functions/get-login-ticket/package.json`
- Test: `cloudbase/functions/get-login-ticket/product-session-service.test.mjs`
- Test: `cloudbase/functions/get-login-ticket/index.test.mjs`

- [ ] **Step 1: Write failing service tests**

```js
const result = await service.issue({ code: "fresh-code" });
assert.equal(result.user.id, "user-1");
assert.equal(typeof result.session.accessToken, "string");
assert.equal("openid" in result, false);
```

- [ ] **Step 2: Run test to verify RED**

Run: `node --test cloudbase/functions/get-login-ticket/product-session-service.test.mjs`

Expected: FAIL because the product-session module does not exist.

- [ ] **Step 3: Implement the service**

```js
const openidHash = createHmac("sha256", identityPepper)
  .update(`openid:${openid}`)
  .digest("hex");
```

Use `app_users.openid_hash` to find or create the product user; return `{ user, session, onboardingRequired }` and never return OpenID.

- [ ] **Step 4: Make the HTTP handler return the product session**

Replace ticket-specific error codes with `LOGIN_SERVICE_NOT_CONFIGURED` and `LOGIN_SERVICE_UNAVAILABLE`; accept only a JSON POST with a non-empty one-time code.

- [ ] **Step 5: Verify GREEN**

Run: `node --test cloudbase/functions/get-login-ticket/*.test.mjs`

Expected: all function tests pass.

### Task 2: Move the Mini Program to HTTPS WeChat login

**Files:**
- Create: `mini-program/src/api/wechat-https-login-api.ts`
- Modify: `mini-program/src/api/auth-api.ts`
- Modify: `mini-program/src/app.tsx`
- Modify: `mini-program/tests/cloudbase-native-openid-login.test.ts`

- [ ] **Step 1: Write a failing client-boundary test**

```ts
expect(authApi).toContain("Taro.login");
expect(authApi).toContain("requestWechatHttpsLogin");
expect(authApi).not.toContain("callNordicApi");
expect(app).not.toContain("initializeNativeCloudbase");
```

- [ ] **Step 2: Run test to verify RED**

Run: `pnpm --dir mini-program exec vitest run tests/cloudbase-native-openid-login.test.ts`

Expected: FAIL because the app still initializes `wx.cloud` and calls an Event Function.

- [ ] **Step 3: Implement the HTTPS client**

Call `Taro.login()` once, post only `{ code }` to the existing HTTPS function URL, validate `{ user, session, onboardingRequired }`, and set the local business session.

- [ ] **Step 4: Verify GREEN**

Run: `pnpm --dir mini-program exec vitest run tests/cloudbase-native-openid-login.test.ts`

Expected: PASS.

### Task 3: Deploy and validate the HTTPS boundary

**Files:**
- Modify: CloudBase function configuration for `get-login-ticket`

- [ ] **Step 1: Add server-only configuration**

Keep existing `WX_APPID`, `WX_SECRET`, `TCB_ENV`, and `IDENTITY_HASH_PEPPER`; add `CLOUDBASE_APIKEY` and `APP_SESSION_SECRET`. Never add them to Mini Program source or `.env` files.

- [ ] **Step 2: Deploy function code**

Run: `manageFunctions(action="updateFunctionCode", functionName="get-login-ticket", functionRootPath="/Users/lewis/Documents/Nordic-Nutri-AI/cloudbase/functions")`.

- [ ] **Step 3: Run static validation**

Run:

```bash
pnpm --dir mini-program run test:unit
pnpm --dir mini-program run typecheck
pnpm --dir mini-program run build:weapp
pnpm --dir mini-program run verify:weapp
node --test cloudbase/functions/get-login-ticket/*.test.mjs
```

- [ ] **Step 4: Validate in WeChat Developer Tools**

Reload `mini-program/dist/weapp/`, press login, and verify exactly one HTTPS request to the CloudBase function. The request must not contain OpenID, CloudBase API keys, a custom ticket, or an RDB REST request.
