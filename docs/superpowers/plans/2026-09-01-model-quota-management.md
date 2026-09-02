# Model Quota Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-enforced model quota policies and a truthful quota-management UI for DEV.

**Architecture:** A server-only PG policy table is paired with a private per-provider/model/feature UTC-day counter. A security-definer RPC atomically checks and increments the global counter immediately before a provider request. The existing route identifies the active model; the admin quota API joins policy, routing, and observability; the existing static admin page edits policy through authenticated admin endpoints.

**Tech Stack:** CloudBase HTTP function, PostgreSQL migrations/RLS, Node.js tests, static HTML/CSS/JavaScript.

---

### Task 1: Add server-only policy schema

**Files:**
- Create: `cloudbase/migrations/20260901120000_ai_model_quota_policies.sql`
- Create: `cloudbase/pg/migrations/0057_ai_model_quota_policies.sql`
- Test: `cloudbase/pg/migrations/0057_ai_model_quota_policies.test.mjs`

- [ ] **Step 1: Write the failing migration contract test**

```js
assert.match(sql, /create table if not exists public\.ai_model_quota_policies/i);
assert.match(sql, /unique \(provider_key, model_key, feature_key\)/i);
assert.match(sql, /enable row level security/i);
```

- [ ] **Step 2: Run the test**

Run: `node --test cloudbase/pg/migrations/0057_ai_model_quota_policies.test.mjs`

- [ ] **Step 3: Add migration and RLS**

Create the policy table, private UTC-day counter table, and security-definer atomic consume RPC with bounded integer limits, source mode check constraints, server-only RLS, and route lookup indexes.

- [ ] **Step 4: Verify the test passes**

Run: `node --test cloudbase/pg/migrations/0057_ai_model_quota_policies.test.mjs`

### Task 2: Implement policy service and enforcement contract

**Files:**
- Create: `cloudbase/functions/get-login-ticket/model-quota-policy-service.cjs`
- Create: `cloudbase/functions/get-login-ticket/model-quota-policy-service.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/index.js`

- [ ] **Step 1: Write failing tests**

```js
assert.equal(await service.resolve({ providerKey: "deepseek", modelKey: "m", featureKey: "coach" }).dailyRequestLimit, 30);
await assert.rejects(() => service.assertAllowed({ providerKey: "deepseek", modelKey: "m", featureKey: "coach" }), /MODEL_QUOTA_EXCEEDED/);
```

- [ ] **Step 2: Run tests and observe RED**

Run: `node --test cloudbase/functions/get-login-ticket/model-quota-policy-service.test.mjs`

- [ ] **Step 3: Implement only the tested service operations**

Resolve exact provider/model/feature rows, preserve defaults when no row exists, and use the dedicated atomic RPC instead of user rate-window storage.

- [ ] **Step 4: Wire only active routed invokers**

Apply enforcement immediately before provider invocation and record rejected calls in existing observability.

- [ ] **Step 5: Verify focused tests**

Run: `node --test cloudbase/functions/get-login-ticket/model-quota-policy-service.test.mjs cloudbase/functions/get-login-ticket/index.test.mjs`

### Task 3: Add protected admin policy endpoints

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Test: `cloudbase/functions/get-login-ticket/index.test.mjs`

- [ ] **Step 1: Add failing HTTP contract tests**

Test admin-session-only GET/PUT `/ops/model-quota-policies`, redacted response shape, and rejected malformed bounds.

- [ ] **Step 2: Run the failing test**

Run: `node --test cloudbase/functions/get-login-ticket/index.test.mjs`

- [ ] **Step 3: Implement authenticated routes**

Use existing admin console session gate, validate all body fields, and record metadata-only audit events.

- [ ] **Step 4: Run integration test**

Run: `node --test cloudbase/functions/get-login-ticket/index.test.mjs`

### Task 4: Add the quota policy editor and truthful presentation

**Files:**
- Modify: `cloudbase/admin/food-images.html`
- Modify: `cloudbase/admin/food-images.quota-ui.test.mjs`

- [ ] **Step 1: Write failing static UI contract test**

Assert policy editor controls, source labels, and provider/model identity attributes exist.

- [ ] **Step 2: Run the test**

Run: `node --test cloudbase/admin/food-images.quota-ui.test.mjs`

- [ ] **Step 3: Implement UI**

Add one modal editor, bind to the protected policy endpoints, show system observation separately from manual/automatic/unsupported vendor balance, and refresh after save.

- [ ] **Step 4: Verify script syntax and UI test**

Run: `node --test cloudbase/admin/food-images.quota-ui.test.mjs && node -e 'const fs=require("fs");const h=fs.readFileSync("cloudbase/admin/food-images.html","utf8");new Function([...h.matchAll(/<script>([\\s\\S]*?)<\\/script>/g)].map(x=>x[1]).join("\\n"))'`

### Task 5: Apply DEV migration, deploy, and read back

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/*`
- Modify: `cloudbase/admin/food-images.html`

- [ ] **Step 1: Run all focused tests and code review**

Run: `node --test cloudbase/functions/get-login-ticket/model-quota-policy-service.test.mjs cloudbase/functions/get-login-ticket/observability-service.test.mjs cloudbase/functions/get-login-ticket/index.test.mjs cloudbase/admin/food-images.quota-ui.test.mjs`

- [ ] **Step 2: Apply only the versioned DEV migration**

Use `managePgDatabase(action="applyMigration")` against `test-dev-d4gyxnn0b5dfa2c8a`, then verify migration history.

- [ ] **Step 3: Deploy only the existing DEV function and static page**

Update `get-login-ticket` and `admin/food-images.html`; do not alter production, credentials, or public domains.

- [ ] **Step 4: Read back**

Verify migration history, Active function status, and the uploaded hosting object; then manually verify the authenticated admin editor.
