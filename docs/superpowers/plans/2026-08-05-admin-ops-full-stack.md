# Admin Ops Full Stack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the CloudBase admin console fast to switch, and ship ops observability, quotas/cost, content-safety review, deletion audit, and food-image patrol rhythm, plus light user-facing quota clarity.

**Architecture:** Keep `get-login-ticket` as the HTTPS API. Persist ops events and durable deletion audits in PG. Admin HTML gains **运营总览** / **额度管理** / **内容安全** modules; lag fixes target review-queue DOM rebuilds and module-list caching. Mini program surfaces remaining vision/coach quotas (no account data export).

**Tech Stack:** CloudBase Function (Node CJS), PostgreSQL migrations, monolithic `cloudbase/admin/food-images.html`, Taro mini program.

---

## File map

| Path | Responsibility |
|------|----------------|
| `cloudbase/pg/migrations/0034_admin_ops_full.sql` | ops events, durable deletion audit, content flags |
| `cloudbase/functions/get-login-ticket/observability-service.cjs` | record/query metrics |
| `cloudbase/functions/get-login-ticket/content-moderation-service.cjs` | shared text denylist + flag queue |
| `cloudbase/functions/get-login-ticket/operation-guard.cjs` | add consumeQuota |
| `cloudbase/functions/get-login-ticket/index.js` | wire routes + emit metrics |
| `cloudbase/admin/food-images.html` | lag fixes + new modules |
| `mini-program/src/...` | quota remaining UI + export entry |

## Tasks

### Task 1: Admin lag fixes
### Task 2: Migration + observability service + admin overview API
### Task 3: Vision/coach quota enforce + remaining API + mini-program tips
### Task 4: Content moderation on feedback/coach + admin queue
### Task 5: Durable deletion audit + patrol rhythm dashboard
### Task 6: Account data export (API + 我的入口)
### Task 7: Deploy admin + function; verify tests

---

### Task 1: Admin lag fixes

**Files:** `cloudbase/admin/food-images.html`, `food-images.test.mjs`

- [x] Stop calling full `renderQueue()` from `selectItem` / select-all — update selection classes + inspector only
- [x] Cache users/feedback/foods list with 60s TTL; skip refetch on tab switch if fresh
- [x] Parallelize `connect()` loads; `loading="lazy"` on review thumbnails

### Task 2: Observability foundation

**Files:** migration `0034`, `observability-service.cjs`, `index.js`, admin HTML

- [x] Tables: `ops_metric_events`, durable `ops_account_deletion_log` (no cascade wipe)
- [x] `recordMetric(metric, value, meta)` / `getOpsOverview({ hours })`
- [x] Emit from vision success/fail+latency, RATE_LIMITED, cancel fail/success, coach limit
- [x] `GET /api/admin/ops/overview` + admin module **运营总览**

### Task 3: Quotas

- [x] `consumeQuota` for `vision_analysis` (10/day, 3/10min) using `rate_limit_windows` or RPC
- [x] `GET /account/usage` → remaining vision/coach
- [x] Mini program: show remaining near scanner / coach when low

### Task 4: Content safety

- [x] Shared moderation list for feedback + coach input
- [x] Flag table + admin list/patch; reject submit with clear error when blocked

### Task 5: Deletion audit + patrol rhythm

- [x] Write deletion log before user row delete
- [x] Admin: deletion log table + patrol “今日缺图/待审/日额度” strip (reuse existing APIs)

### Task 6: Export — cancelled

- [x] Account data export removed from mini program and API (`/account/export` retired)
### Task 7: Verify

- [x] Function unit tests + admin HTML contract tests + mini-program tests
- [x] Deploy hosting admin page + function when green
