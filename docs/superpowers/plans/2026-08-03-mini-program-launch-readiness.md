# Mini Program Launch Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Nordic Nutri AI ready for a compliant, resilient, observable WeChat Mini Program release: clear privacy disclosure, a discreet product-account cancellation path, reliable scan/edit/save behavior on weak networks, and bounded AI cost.

**Architecture:** Keep the Mini Program as a thin client and enforce deletion, idempotency, quotas, and observability in `get-login-ticket`. A user cancellation is a product-account operation only: it never touches the user’s WeChat account; after two in-app confirmations it deletes user-owned CloudBase Storage objects first, then deletes the `app_users` row so existing FK cascades physically remove user-owned PG rows. Reliability state that must survive a network interruption is held in a local draft; all server mutations reuse a stable request ID until they reach a terminal result.

**Environment strategy:** The current CloudBase free environment remains the only development and launch-candidate environment. It must contain test accounts only until public release. Do not create a second free environment or copy data. Before public release, explicitly choose and approve one of: upgrade this same environment to a paid production package, or create a separate paid production environment and perform a documented migration. The recommended low-complexity path is upgrading the existing validated environment; this plan does not deploy or upgrade it automatically.

**Tech Stack:** Taro 4 + React + TypeScript + Zustand + TanStack Query, CloudBase HTTPS Function (Node.js CommonJS), CloudBase PostgreSQL, CloudBase Storage, WeChat Developer Tools, CloudBase CLS/monitoring.

---

## Confirmed product decisions

- The familiar setting is **退出登录**. It clears the local session only and remains a normal profile action.
- **注销 Nordic Nutri AI 产品账号与删除数据** lives at the bottom of `我的 → 隐私与数据`, not on Home or the login page. It never claims to cancel the WeChat account.
- The cancellation sheet requires two explicit confirmations. After the second confirmation, deletion begins immediately; it is irreversible and has no grace period or account recovery.
- The deletion scope is the signed-in user’s profile, settings, body data, goals/plans, meals/items, AI analysis, coach conversations/messages, insights, feedback, avatar/scan/coach-uploaded private objects, and local session/drafts. Shared food catalog and administrator-owned food-image resources are out of scope.
- The first observability release uses CloudBase logs and alerts only. No third-party error-monitoring SDK is introduced in this plan.
- AI fallbacks must be transparent: a rule-based insight may replace a text-model insight; a failed image recognition must never fabricate a meal and instead leads to retry, edit, or manual record.

## Launch gates

The implementation is not release-ready until all of the following are true:

1. Privacy policy, collection/use descriptions, permission purpose, retention/deletion mechanism, and contact channel are approved by the product owner and configured in the WeChat Mini Program privacy/review console.
2. A real user can cancel the product account from a physical device; PG rows and every user-owned storage object are absent afterwards; retrying the same cancellation does not delete another user’s data.
3. On a throttled/offline simulator and device, a scan draft survives a restart, a mutation retry does not create duplicates, and failed recognition can become an editable manual meal.
4. CloudBase dashboard shows the agreed structured metrics and alerts for vision failures, high latency, quota rejections, deletion failures, and function 5xx errors.
5. WeChat Developer Tools and one real device pass the review checklist. Static tests/build output are evidence, not substitutes for this gate.
6. Before public release, the owner has explicitly approved the paid production path for the current environment. No public launch is performed while the only free environment is being used as a destructive-test environment.

## File map

| Path | Responsibility |
|---|---|
| `mini-program/src/pages/profile/index.tsx` | Link from the existing privacy sheet to policy and cancellation UI; retain logout separately. |
| `mini-program/src/pages/privacy-policy/index.tsx` and `index.config.ts` | Readable in-app policy and data-rights page. |
| `mini-program/src/pages/account-cancellation/index.tsx` and `index.config.ts` | Two-step confirmation, terminal progress/success/failure state, local logout/cleanup. |
| `mini-program/src/api/product-data-api.ts` | Typed `POST /account/cancel` API client. |
| `mini-program/src/features/account-cancellation/*` | Pure confirmation-state and client cleanup helpers with unit tests. |
| `mini-program/src/features/media/image-upload-limits.ts` | Final compressed-file size assertion. |
| `mini-program/src/features/scanner/scan-draft.ts` | Versioned local scan draft persistence and cleanup. |
| `mini-program/src/pages/food-scanner/index.tsx` | Permission recovery, resume/remove draft, stable scan request ID. |
| `mini-program/src/pages/analysis-result/index.tsx` and `portion-adjustment/index.tsx` | Prevent repeat saves; navigate to item editor. |
| `mini-program/src/pages/meal-editor/index.tsx` and `index.config.ts` | Add/delete/rename ingredient and edit nutrition/quantity before save. |
| `mini-program/src/api/vision-api.ts`, `meal-data-api.ts`, `product-api-client.ts` | Stable mutation keys, retry classification, timeout-safe errors. |
| `mini-program/src/app.config.ts` | Register the three non-tab pages. |
| `cloudbase/functions/get-login-ticket/account-deletion-service.cjs` | Server-side cancellation authorization, storage deletion, PG deletion, safe audit event. |
| `cloudbase/functions/get-login-ticket/operation-guard-service.cjs` | Per-user route quotas, sliding-window counters, and idempotency ownership. |
| `cloudbase/functions/get-login-ticket/observability-service.cjs` | Redacted structured event schema and metric emission. |
| `cloudbase/functions/get-login-ticket/index.js` | Route `/account/cancel`, guard protected routes, inject services, log terminal outcomes. |
| `cloudbase/functions/get-login-ticket/*.test.mjs` | Function-level contracts for deletion, quotas, observations, vision fallback, and idempotency. |
| `cloudbase/pg/migrations/0032_launch_readiness.sql` | Request-operation ledger, rate-limit windows, deletion audit record, indexes, RLS/server-only policies. |
| `cloudbase/pg/migrations/0032_launch_readiness.test.mjs` | Migration/schema contract checks. |
| `docs/WECHAT_RELEASE_CHECKLIST.md` | Review-console, privacy, domain, device, CloudBase alert and rollback checklist. |

## API and data contracts

### Product-account cancellation

`POST /account/cancel`

```json
{
  "confirmation": "DELETE_MY_NORDIC_NUTRI_ACCOUNT",
  "clientRequestId": "UUID"
}
```

Success is `200` with `{ "deleted": true, "requestId": "UUID" }`. The server reads the user only from the bearer session. It rejects missing/incorrect confirmation with `400 ACCOUNT_CANCELLATION_CONFIRMATION_REQUIRED`, duplicate in-flight requests with `409 ACCOUNT_CANCELLATION_IN_PROGRESS`, and a missing/expired session with `401 UNAUTHORIZED`. It must never accept a client-provided user ID or return object paths, OpenID hashes, stack traces, or provider errors.

### Mutation identity

Every scan-analysis, meal creation, feedback submission, coach send, and cancellation starts with one `clientRequestId`; retries of the same draft reuse that ID. A new ID is issued only after a successful terminal response or an explicit discard/new draft. The server records `(user_id, operation, client_request_id)` before performing a side effect and returns the recorded terminal response for a repeat.

### Rate-limit response

`429` always returns this safe body:

```json
{
  "code": "RATE_LIMITED",
  "message": "请求过于频繁，请稍后重试",
  "retryAfterSeconds": 60
}
```

Initial limits: vision analysis 10/day and 3/10 minutes/user; coach answer 30/day and 10/10 minutes/user; all other protected writes 30/10 minutes/user. Limits are environment variables read by the function with the above values as validated defaults; they are not exposed to the Mini Program.

## Task 1: Establish the release contract and migration

**Files:**

- Create: `cloudbase/pg/migrations/0032_launch_readiness.sql`
- Create: `cloudbase/pg/migrations/0032_launch_readiness.test.mjs`
- Create: `docs/WECHAT_RELEASE_CHECKLIST.md`

- [ ] **Step 1: Write the schema contract tests first.**

Assert that the migration creates `private.operation_requests`, `private.rate_limit_windows`, and `private.account_deletion_audit`; each table has a user reference, route/operation scope, timestamps, server-only RLS denial, and indexes for the lookups below. Assert that `account_deletion_audit` stores only user UUID, request UUID, outcome, timestamps, and failure code—not OpenID, image paths, content, or raw errors.

Run: `node --test cloudbase/pg/migrations/0032_launch_readiness.test.mjs`

Expected: FAIL because migration `0032` does not exist.

- [ ] **Step 2: Add an idempotency and quota schema.**

Implement these minimum database objects:

```sql
create table public.account_deletion_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  client_request_id uuid not null,
  outcome text not null check (outcome in ('started', 'succeeded', 'failed')),
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, client_request_id)
);

create table private.operation_requests (
  user_id uuid not null,
  operation text not null,
  client_request_id uuid not null,
  state text not null check (state in ('started', 'succeeded', 'failed')),
  response jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  primary key (user_id, operation, client_request_id)
);
```

Use a separate `private.rate_limit_windows` table keyed by `(user_id, operation, window_started_at)` with a non-negative counter. Revoke all direct client grants and use explicit deny RLS policies for all new tables.

- [ ] **Step 3: Add the release checklist.**

The checklist must require: approved privacy-policy text and contact details; completed Mini Program privacy configuration; declared camera/photo-album/avatar permissions and their purposes; legal HTTPS domains; a review account and deterministic test data; all three launch gates above; CloudBase CLS retention/access review; alert recipients; rollback version; and a real-device cancellation proof.

- [ ] **Step 4: Run migration contract tests.**

Run: `node --test cloudbase/pg/migrations/0032_launch_readiness.test.mjs`

Expected: PASS.

## Task 2: Implement server-owned cancellation and storage cleanup

**Files:**

- Create: `cloudbase/functions/get-login-ticket/account-deletion-service.cjs`
- Create: `cloudbase/functions/get-login-ticket/account-deletion-service.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/index.js`

- [ ] **Step 1: Write failing cancellation-service tests.**

Cover: invalid confirmation is rejected; only `session.sub` is used; storage paths are queried from `uploaded_assets`, `profiles.avatar_path`, `ai_analysis.image_path`, and `meal_records.image_path`; storage deletion occurs before the PG user-row deletion; repeated request ID returns its recorded result; storage-delete failure preserves the account and records a failed audit; and a foreign user ID cannot be deleted.

Run: `node --test cloudbase/functions/get-login-ticket/account-deletion-service.test.mjs`

Expected: FAIL because the service does not exist.

- [ ] **Step 2: Build the service with an explicit deletion order.**

Expose `createAccountDeletionService({ db, deleteFiles, operationRequests, observe, now })`. Its `cancelAccount(userId, input)` must validate `confirmation`, claim the operation request, collect unique user-owned paths, call `deleteFiles({ cloudPaths })`, then execute `db.from("app_users").delete().eq("id", userId)`. It records success only after both storage and PG deletion succeed. Do not delete CloudBase Auth/WeChat identity from this route; deleting the product mapping permits a future product registration while leaving WeChat untouched.

- [ ] **Step 3: Add the route and session cleanup contract.**

Extend `getDataOperation` with `"/account/cancel": "cancelAccount"`; permit only `POST`; verify the bearer session before reading the body; map known cancellation errors to 400/409/503; and do not pass arbitrary request fields to the service.

- [ ] **Step 4: Run function tests.**

Run: `node --test cloudbase/functions/get-login-ticket/account-deletion-service.test.mjs cloudbase/functions/get-login-ticket/index.test.mjs`

Expected: PASS.

## Task 3: Add privacy, permissions, logout, and cancellation user flows

**Files:**

- Create: `mini-program/src/pages/privacy-policy/index.tsx`
- Create: `mini-program/src/pages/privacy-policy/index.config.ts`
- Create: `mini-program/src/pages/account-cancellation/index.tsx`
- Create: `mini-program/src/pages/account-cancellation/index.config.ts`
- Create: `mini-program/src/features/account-cancellation/confirmation.ts`
- Create: `mini-program/src/features/account-cancellation/confirmation.test.ts`
- Modify: `mini-program/src/pages/profile/index.tsx`
- Modify: `mini-program/src/api/product-data-api.ts`
- Modify: `mini-program/src/app.config.ts`
- Modify: `mini-program/src/styles/page.scss`

- [ ] **Step 1: Define the cancellation state-machine tests.**

Test `idle → warning → finalConfirmation → submitting → succeeded|failed`; the action is enabled only after both confirmations; success clears the local auth/session, meal, analysis, scanner, and persisted draft state; failure keeps the account session and shows a safe retry action.

Run: `pnpm --dir mini-program test:unit -- features/account-cancellation/confirmation.test.ts`

Expected: FAIL because the state helper does not exist.

- [ ] **Step 2: Add typed client access.**

Add `cancelProductAccount(clientRequestId)` in `product-data-api.ts`; it sends the exact confirmation string and the caller-owned stable UUID to `POST /account/cancel`. Keep the message mapping in `product-api-client.ts` and display only product-safe text.

- [ ] **Step 3: Implement the in-app information pages.**

The privacy page must state controller/contact, collection categories, purpose, storage location, retention, camera/album/avatar use, AI processing, user rights, deletion scope, and policy version/effective date. `ProfilePage` opens it from the existing privacy item. The cancellation page labels itself “注销 Nordic Nutri AI 产品账号”, explains that WeChat is unaffected and deletion is irreversible, presents the two confirmations, then routes success to `/pages/auth-entry/index` with `Taro.reLaunch`.

- [ ] **Step 4: Keep permissions purpose-bound.**

Before invoking a camera/album/avatar API, use the platform setting API to inspect only the relevant scope. If denied, show a sheet that explains the purpose and offers `Taro.openSetting`; retain album selection as the camera-denied fallback. Do not request unrelated permissions on page load.

- [ ] **Step 5: Register and verify pages.**

Register the policy and cancellation paths in `app.config.ts`, add page config titles, and verify no new page is added to the native tab list.

Run: `pnpm --dir mini-program test:unit && pnpm --dir mini-program typecheck && pnpm --dir mini-program lint`

Expected: PASS.

## Task 4: Make scan upload deterministic and recoverable on weak networks

**Files:**

- Create: `mini-program/src/features/scanner/scan-draft.ts`
- Create: `mini-program/src/features/scanner/scan-draft.test.ts`
- Modify: `mini-program/src/features/media/image-upload-limits.ts`
- Modify: `mini-program/src/api/vision-api.ts`
- Modify: `mini-program/src/pages/food-scanner/index.tsx`
- Modify: `mini-program/src/stores/scanner-store.ts`
- Modify: `mini-program/src/api/product-api-client.ts`

- [ ] **Step 1: Write failing scan-draft tests.**

Test a versioned persisted payload containing draft ID, request ID, local file path, creation time, upload state, and safe error code; reject stale/corrupt drafts; preserve the same request ID during retry; clear only after a terminal result or explicit discard.

Run: `pnpm --dir mini-program test:unit -- features/scanner/scan-draft.test.ts`

Expected: FAIL because no persistent draft module exists.

- [ ] **Step 2: Add final image-size enforcement.**

Add `assertImageWithinUploadLimit(sizeBytes)` to `image-upload-limits.ts`. `prepareImagePath` must compress at most twice, read final file info, and reject with a safe size message if the result still exceeds `MAX_UPLOAD_IMAGE_BYTES`; it must never silently upload an oversized base64 payload.

- [ ] **Step 3: Persist and resume scan work.**

Create the draft before the first network request. On launch/show, render a resume/discard choice for a non-expired draft. Use the stored request ID when calling `analyzeProductImage`; discard deletes the persisted metadata and temporary file when the platform allows it. A timeout/error leaves the draft available and offers retry, select another image, or manual record.

- [ ] **Step 4: Classify network failures consistently.**

Make `product-api-client.ts` preserve 429, timeout, offline, authorization, and 5xx error names. GET queries may retry with bounded backoff; mutations must not auto-retry unless they have a stable request ID and the same persisted draft. Add `Taro.onNetworkStatusChange` only to update visible offline state—never as the source of truth for a completed mutation.

- [ ] **Step 5: Run scanner checks.**

Run: `pnpm --dir mini-program test:unit -- tests/image-upload-limits.test.ts tests/vision-api-boundary.test.ts features/scanner/scan-draft.test.ts && pnpm --dir mini-program typecheck`

Expected: PASS.

## Task 5: Support recognition correction and prevent duplicate meal saves

**Files:**

- Create: `mini-program/src/pages/meal-editor/index.tsx`
- Create: `mini-program/src/pages/meal-editor/index.config.ts`
- Create: `mini-program/src/features/meals/editable-analysis.ts`
- Create: `mini-program/src/features/meals/editable-analysis.test.ts`
- Modify: `mini-program/src/pages/analysis-result/index.tsx`
- Modify: `mini-program/src/pages/portion-adjustment/index.tsx`
- Modify: `mini-program/src/api/meal-data-api.ts`
- Modify: `mini-program/src/repositories/client-request-id.ts`
- Modify: `mini-program/src/app.config.ts`

- [ ] **Step 1: Write editable-analysis tests.**

Cover rename, add, remove, quantity update, nutrition-per-100g update, calculated totals, zero/negative rejection, max 2,000 g/item, and preservation of the original AI quantity separately from the user-confirmed quantity.

Run: `pnpm --dir mini-program test:unit -- features/meals/editable-analysis.test.ts`

Expected: FAIL because editable analysis does not exist.

- [ ] **Step 2: Add the editor route.**

The result page gets an “编辑食材” action beside “调整份量”. The editor starts from the recognition result or, after failed recognition, creates an empty meal draft while retaining the chosen local image. It supports add/remove/rename/quantity/nutrition edits and returns a validated draft to the result page; no model call happens during editing.

- [ ] **Step 3: Stabilize meal creation identity.**

Use `createClientRequestIds().forDraft(draftId)` for each meal save. Disable the analysis save button while submitting, pass the stable ID into `createProductMeal`, and call `complete(draftId)` only after the API returns a terminal result. A timeout retry must call the same server operation ID and receive the original saved meal rather than insert another row.

- [ ] **Step 4: Run meal-flow checks.**

Run: `pnpm --dir mini-program test:unit -- tests/vision-api-boundary.test.ts features/meals/editable-analysis.test.ts && pnpm --dir mini-program typecheck`

Expected: PASS.

## Task 6: Add server idempotency and rate-limit guards

**Files:**

- Create: `cloudbase/functions/get-login-ticket/operation-guard-service.cjs`
- Create: `cloudbase/functions/get-login-ticket/operation-guard-service.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Modify: `cloudbase/functions/get-login-ticket/vision-data-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/meal-data-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/feedback-data-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/coach-data-service.cjs`

- [ ] **Step 1: Write guard tests.**

Test that an operation is atomically claimed once per `(user, operation, requestId)`; a completed duplicate returns the stored result; an in-progress duplicate returns a conflict; each quota window permits exactly its configured limit; the next request returns `RATE_LIMITED` with a positive retry delay; user A’s counter cannot affect user B.

Run: `node --test cloudbase/functions/get-login-ticket/operation-guard-service.test.mjs`

Expected: FAIL because the guard does not exist.

- [ ] **Step 2: Implement atomic guard behavior.**

Expose `claim`, `complete`, `fail`, and `consumeQuota`. Use a database conditional insert/upsert and unique primary key rather than an in-memory lock. The route calls `consumeQuota` before an expensive model call and `claim` before a mutation; it calls `complete` with a safe response snapshot after success and `fail` with only a public error code after failure.

- [ ] **Step 3: Apply guards to high-cost and duplicate-prone routes.**

Guard `/vision-analysis`, `/meal-analysis`, `/meals` POST, `/feedback`, `/coach-answer`, `/coach-answer/stream`, and `/account/cancel`. Do not rate-limit read-only profile/food reads in this change. Map quota failures to HTTP 429 and preserve `retryAfterSeconds` for the client.

- [ ] **Step 4: Run server contract tests.**

Run: `node --test cloudbase/functions/get-login-ticket/operation-guard-service.test.mjs cloudbase/functions/get-login-ticket/vision-data-service.test.mjs cloudbase/functions/get-login-ticket/meal-data-service.test.mjs cloudbase/functions/get-login-ticket/feedback-data-service.test.mjs cloudbase/functions/get-login-ticket/coach-data-service.test.mjs`

Expected: PASS.

## Task 7: Make model timeout and degradation explicit

**Files:**

- Modify: `cloudbase/functions/get-login-ticket/qwen-vision-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/vita-vision-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/deepseek-meal-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/daily-tip-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/observability-service.cjs`
- Modify: related `*.test.mjs`

- [ ] **Step 1: Add failure-mode tests.**

Test provider timeout, non-200 response, malformed model JSON, non-food image, and rule-fallback output. Assert: vision returns a public retryable/unavailable error and never invents items; text insight returns `source: "rule_v*"` when a defined safe fallback exists; raw upstream error bodies are never returned.

- [ ] **Step 2: Standardize the deadline budget.**

Each upstream model adapter receives an `AbortController` deadline shorter than the enclosing HTTP function. The route translates known provider failures to public `VISION_RETRYABLE`, `VISION_RESULT_INVALID`, `VISION_NON_FOOD`, or `AI_SERVICE_UNAVAILABLE`; it logs a redacted outcome with provider/model/duration only.

- [ ] **Step 3: Verify no hidden automatic vision retry.**

Do not retry image recognition automatically after a timeout because it may duplicate model cost. The user-visible retry reuses the stored request ID and guard. Text-only, deterministic rule fallbacks remain available for coach/daily/weekly insights where existing services define one.

- [ ] **Step 4: Run model tests.**

Run: `node --test cloudbase/functions/get-login-ticket/qwen-vision-service.test.mjs cloudbase/functions/get-login-ticket/vita-vision-service.test.mjs cloudbase/functions/get-login-ticket/daily-tip-service.test.mjs cloudbase/functions/get-login-ticket/deepseek-meal-service.test.mjs`

Expected: PASS.

## Task 8: Add privacy-safe observability and alert contracts

**Files:**

- Create: `cloudbase/functions/get-login-ticket/observability-service.cjs`
- Create: `cloudbase/functions/get-login-ticket/observability-service.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Modify: `docs/WECHAT_RELEASE_CHECKLIST.md`

- [ ] **Step 1: Write redaction tests.**

Pass a payload containing bearer token, OpenID hash, nickname, image base64, storage path, prompt, and model error body. Assert emitted events retain only `event`, `requestId`, `route`, `userIdHash`, `statusCode`, `errorCode`, `durationMs`, `provider`, `model`, `fallbackUsed`, and `quotaOutcome`.

Run: `node --test cloudbase/functions/get-login-ticket/observability-service.test.mjs`

Expected: FAIL because the service does not exist.

- [ ] **Step 2: Emit terminal structured events.**

Implement `observe(event)` with a fixed allowlist and a keyed hash of user ID. Instrument login, vision, meal creation, coach reply, account cancellation, quota rejection, and unexpected HTTP failures. Emit one completion event per request; do not log request bodies or responses containing personal/health data.

- [ ] **Step 3: Configure the CloudBase console gate manually.**

Before deployment, configure CLS/index queries and alerts for: 5xx rate > 1%/5 min, vision retryable/unavailable rate > 15%/15 min, p95 vision duration > 45 s/15 min, rate-limit rejections > 20/user/day, cancellation failures > 0, and daily vision/coach usage > 80% of budget. Record dashboard and alert URLs, owners, and test alert proof in the checklist without copying secrets.

- [ ] **Step 4: Run redaction tests.**

Run: `node --test cloudbase/functions/get-login-ticket/observability-service.test.mjs`

Expected: PASS.

## Task 9: Run full automated verification

**Files:**

- Modify only as required by failed tests from Tasks 1–8.

- [ ] **Step 1: Run database migration contracts.**

Run: `node --test cloudbase/pg/migrations/*.test.mjs`

Expected: PASS.

- [ ] **Step 2: Run all cloud-function tests.**

Run: `npm --prefix cloudbase/functions/get-login-ticket test`

Expected: PASS.

- [ ] **Step 3: Run Mini Program static verification.**

Run: `pnpm --dir mini-program test:unit && pnpm --dir mini-program typecheck && pnpm --dir mini-program lint && pnpm --dir mini-program verify:weapp && pnpm --dir mini-program build:weapp`

Expected: all commands exit `0` and the WXSS verifier reports compatibility success.

- [ ] **Step 4: Inspect change scope.**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only launch-readiness files and intentional generated artifacts are changed.

## Task 10: Deployment and real-device acceptance

**Files:**

- Modify: `docs/WECHAT_RELEASE_CHECKLIST.md` with completed evidence only.

- [ ] **Step 1: Obtain explicit deployment confirmation.**

Before any CloudBase migration or function deployment, report the exact migration/function targets, environment ID, changed resources, unchanged resources, rollback approach, and planned validation. Confirm whether the target is still the free development/launch-candidate environment. Wait for the user’s explicit `确认`.

- [ ] **Step 2: Apply backend changes in dependency order.**

After confirmation: plan and apply migration `0032`; deploy only `get-login-ticket`; verify function environment limits and no secrets in logs; then inspect the live schema/route health. Do not alter unrelated image-worker, food-batch, catalog, or auth-provider resources.

- [ ] **Step 3: Import the built output into WeChat Developer Tools.**

Use `mini-program/dist/weapp/`, clear stale cache, normal compile, and verify production-like request domains. Do not rely on `project.config.json`’s development `urlCheck: false` setting as acceptance.

- [ ] **Step 4: Execute the device acceptance matrix.**

Validate: first camera prompt, deny then open settings, album fallback, 8MB reject, compression limit, offline scan/restart/resume, timeout retry with one saved result, failed recognition to editable manual record, double-tap save, 429 copy, logout, policy view, cancellation double confirmation, cancellation completion/login reset, and absence of the cancelled user’s rows/objects using an administrator read-only check.

- [ ] **Step 5: Complete release evidence.**

Attach screenshots or test records for the privacy page, cancellation outcome, DevTools network errors, real-device permission flow, CloudBase dashboard/alert test, and table/storage deletion proof. Mark only evidenced checklist items complete.

- [ ] **Step 6: Promote the single environment only after explicit approval.**

When all development acceptance is complete, present the current environment’s plan, expiry/renewal state, enabled resources, estimated paid package, and production-domain requirements. Wait for explicit approval to upgrade the existing environment. After the console upgrade succeeds, repeat the smoke test with a fresh test user, set daily cost alerts, and only then submit the Mini Program for public release.

## Out of scope

- Cancelling, unlinking, or deleting the user’s WeChat account.
- Migrating from CloudBase, replacing the custom ticket login system, or changing CloudBase Auth providers.
- Retrofitting third-party monitoring, analytics SDKs, payment, or an administrator account-deletion UI.
- Bulk removal of shared food catalog records or administrator-generated food images.

## Final self-review

- Coverage: every requested area—exceptions, permissions, privacy, deletion, model timeout/degradation, duplicate submission, compression, weak network, recognition correction, review, monitoring, cost, and rate limiting—maps to Tasks 1–10.
- Safety: cancellation is explicitly product-account-only; server identity comes from the session; Storage deletion precedes PG cascade; logs are redacted; deployment is confirmation-gated.
- Scope: CloudBase native observability is included, while third-party monitoring and unrelated account/platform changes are excluded.
- Ambiguity resolved: deletion is immediate after two confirmations, with no recovery window; logout remains separate; legal-retention exceptions must be approved before claiming physical deletion of any record class.
