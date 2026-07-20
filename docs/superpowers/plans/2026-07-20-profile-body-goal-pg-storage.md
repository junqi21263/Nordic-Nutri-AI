# Profile, Body, and Goal PostgreSQL Storage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist the logged-in user's profile, body profile, and health goal through the HTTPS CloudBase function into PostgreSQL, without any Supabase calls from these flows.

**Architecture:** The mini program attaches the existing product session token to HTTPS requests. The HTTP function verifies the signed token, derives the user ID from it, and uses its server-only CloudBase API Key to update `profiles`, version `body_profiles`, and version `user_goals`. The client never receives a database credential.

**Tech Stack:** Taro React, Zustand, Node.js HTTP CloudBase function, `@cloudbase/js-sdk` RDB, CloudBase PostgreSQL.

---

### Task 1: Server-owned profile data service

**Files:**
- Create: `cloudbase/functions/get-login-ticket/product-data-service.cjs`
- Create: `cloudbase/functions/get-login-ticket/product-data-service.test.mjs`

- [ ] Write failing tests for a token-derived user ID updating a profile, and for versioning body profiles and goals by setting prior current rows false before inserting a new current row.
- [ ] Run `node --test cloudbase/functions/get-login-ticket/product-data-service.test.mjs` and verify failure because the module is absent.
- [ ] Implement injected RDB operations using only `profiles`, `body_profiles`, and `user_goals`; reject caller-provided user IDs.
- [ ] Run the same command and verify every test passes.

### Task 2: Authenticated HTTPS routes

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Modify: `cloudbase/functions/get-login-ticket/index.test.mjs`

- [ ] Write failing HTTP tests for `POST /profile`, `POST /body-profile`, and `POST /goal`, requiring a Bearer product session and returning only business rows.
- [ ] Run `node --test cloudbase/functions/get-login-ticket/index.test.mjs` and verify the routes fail before implementation.
- [ ] Verify the HMAC product token, route each request to the data service, and return `UNAUTHORIZED` for missing/invalid sessions.
- [ ] Run all function tests and verify they pass.

### Task 3: Mini program HTTPS data client and page saves

**Files:**
- Create: `mini-program/src/api/product-data-api.ts`
- Modify: `mini-program/src/pages/profile-edit/index.tsx`
- Modify: `mini-program/src/pages/body-profile/index.tsx`
- Modify: `mini-program/src/pages/goal-adjust/index.tsx`
- Modify: `mini-program/tests/*profile*`, `mini-program/tests/*goal*`, `mini-program/tests/*body*`

- [ ] Write source-contract tests requiring those pages to call the HTTPS data client and prohibiting `getSupabaseClient`/`selectRuntimeAdapter` in the three save flows.
- [ ] Run the focused tests and verify they fail on the existing Supabase imports.
- [ ] Implement an authenticated Taro request client that reads the product access token from the local session, then replace the three save flows.
- [ ] Run focused tests, full unit tests, typecheck, WeChat build, and WXSS verification.

### Task 4: Deploy and runtime acceptance

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/index.js`

- [ ] Deploy the updated HTTP function.
- [ ] Recompile in WeChat Developer Tools, sign in, save a profile/body/goal change, and verify the HTTP request succeeds.
- [ ] Query the PostgreSQL rows through the CloudBase console or approved database query path, without exposing user data in logs.
