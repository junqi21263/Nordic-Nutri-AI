# Account Profile Readback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the authenticated account-data loop by reading the stored CloudBase PostgreSQL profile, current body profile, and current goal after login and using it to hydrate the existing local profile store.

**Architecture:** Add a read-only `GET /get-login-ticket/account` endpoint to the existing HTTPS function. It authenticates the product session, reads only rows filtered by its server-derived user ID, returns a minimal page-ready account DTO, and the mini program hydrates current stores without changing page JSX, routing, or UI styling.

**Tech Stack:** Taro/React, Zustand, CloudBase HTTP Function, CloudBase JS SDK RDB, PostgreSQL, Node test runner, Vitest.

---

### Task 1: Add a tested server account read model

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/product-data-service.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/product-data-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/index.js`

- [ ] Write a failing test for `getAccount("user-1")` that reads profile, current body profile and current goal with `user_id="user-1"` filters only.
- [ ] Run `node --test cloudbase/functions/get-login-ticket/product-data-service.test.mjs` and confirm failure because `getAccount` is absent.
- [ ] Implement a compact DTO containing nickname, current weight, goal type, target weight, and target calories.
- [ ] Route authenticated `GET /account` requests with the existing Bearer-token verifier.
- [ ] Run `node --test cloudbase/functions/get-login-ticket/*.test.mjs` and confirm pass.

### Task 2: Hydrate the current profile store after login

**Files:**
- Modify: `mini-program/src/api/product-data-api.ts`
- Modify: `mini-program/src/auth/app-auth-bootstrap.ts`
- Modify: `mini-program/src/stores/profile-store.ts`
- Modify: `mini-program/tests/*`

- [ ] Write a failing unit test that the login bootstrap applies the returned account DTO to `useProfileStore`.
- [ ] Implement `getProductAccount()` and a narrow profile-store hydration method that maps API values to existing displayed fields.
- [ ] Invoke the read after the existing HTTPS login succeeds; leave navigation and rendering unchanged.
- [ ] Run `pnpm --dir mini-program test:unit && pnpm --dir mini-program typecheck`.

### Task 3: Deploy and accept in the actual mini program

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/*`
- Generated: `mini-program/dist/weapp/*`

- [ ] Build with `pnpm --dir mini-program build:weapp && pnpm --dir mini-program verify:weapp`.
- [ ] Deploy with `manageFunctions(action="updateFunctionCode", functionName="get-login-ticket", functionRootPath="/Users/lewis/Documents/Nordic-Nutri-AI/cloudbase/functions", confirm=true)`.
- [ ] In WeChat Developer Tools, log in or relaunch and verify `GET /account` returns 200; do not submit user health data on the user's behalf.
