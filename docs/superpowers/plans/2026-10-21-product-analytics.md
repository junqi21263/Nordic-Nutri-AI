# Product Analytics Implementation Plan

> **For agentic workers:** Use subagent-driven-development for the independent backend, App, and website/admin work; integrate and review in the current Android-dev checkout. Steps use checkbox syntax for tracking.

**Goal:** Deliver the approved silent analytics design to DEV with interactive reports and manual export, leaving production unchanged.

**Architecture:** Environment-bound consent credentials authorize bounded batches. Authoritative committed business facts are projected asynchronously; optional analysis never gates business writes. SQL computes exact filtered aggregates and actor cohorts; the App and website use isolated silent queues.

**Tech Stack:** Existing Node CJS CloudBase service, PostgreSQL RPC/RLS, Taro React/TypeScript, vanilla JS admin/website. No new tracking dependency.

## Boundaries

- Current branch Android-dev; no new feature branch or production write.
- Preserve three dirty Google auth files. Commit only analytics files and reviewed integration hunks.
- DEV EnvId test-dev-d4gyxnn0b5dfa2c8a; verify PG context before each migration/deploy.
- Approved spec: docs/superpowers/specs/2026-10-20-product-analytics-design.md, including AC01–AC18.

## Shared wire contract

```ts
interface AnalyticsEvent {
  event_id: string; event_name: string; schema_version: 1;
  occurred_at: string; session_id: string; anonymous_id: string;
  consent_revision: string; platform: 'android' | 'web';
  app_version: string; build_code?: number; page_key: string;
  operation_id?: string; attempt_id?: string; trace_id?: string;
  properties: Record<string, string | number | boolean | string[]>;
}
// POST /analytics/consent JSON:
// { anonymous_id, platform, analytics: boolean, diagnostics: boolean, consent_revision?: string }
// response { consent_revision, collection_token, expires_at, analytics, diagnostics }
// POST /analytics/batch JSON { collection_token, events: AnalyticsEvent[] }
// response { results: [{event_id, status: 'accepted'|'duplicate'|'rejected', reason?: string}] }
// Consent endpoint uses optional existing Bearer user auth; collection credential never grants read/auth access.
// Admin: GET /api/admin/analytics/report?view=overview|acquisition|funnels|retention|features|versions|errors|quality
// filters: from, to (YYYY-MM-DD inclusive Beijing dates), platform, version, channel, page, pageSize.
// report response { view, filters, watermark, metric_version, collection_started_at, summary, series, rows, total, page, pageSize, notes }.
// POST /api/admin/analytics/reports { view, filters, format: 'csv'|'html' }
// GET /api/admin/analytics/reports/:id ; GET .../:id/download; guarded admin access, 7-day expiry.
```

## Task 1: Storage, ingestion, reporting

Files: cloudbase/migrations/20261021010000_product_analytics.sql; cloudbase/functions/get-login-ticket/analytics-{schema,service,service.test}.{cjs,mjs} (use appropriate suffix); dedicated RPC definitions in migration.

- [ ] Inspect existing table columns and auth/RPC conventions; write tests for unknown fields, forged server events, revoked consent, replay and full filtered aggregates.
- [ ] Implement allowlisted schema and signed environment-bound credentials, per-id batch results, durable dedup and rate limits, server-only grants/RLS.
- [ ] Implement recoverable postcommit business projection, exact SQL cohorts/funnels/versions/quality, independent retention cleanup and export snapshots.
- [ ] Verify with `node --test cloudbase/functions/get-login-ticket/analytics*.test.mjs` and DEV migration preview/apply/history/schema readback. Never copy PROD data.

## Task 2: Android silent collection

Files: mini-program/src/features/analytics/*; pages/privacy-data/*; app.tsx; layouts/page-layout.tsx; actual auth/scan/meal/coach/reminder/feedback call sites, profile/app.config and translations.

- [ ] Unit tests with fake transport/clock/storage for default-off, consent revocation, queues, overflow, TTL, retries, partial ack, user switch, no auth refresh and quiet failures.
- [ ] Implement `trackAnalytics(name, properties, context?)`, bounded in-memory enqueue, async persistence and one in-flight low-priority transport; pause critical flows, no keepalive, no UI notifications.
- [ ] Add passive three-language privacy settings using existing layout/switch UI. No onboarding analytics invitation.
- [ ] Instrument allowed lifecycle/functional events; distinguish client observation from server authority, Nova protocol terminal from disconnect; never include user content.
- [ ] Run targeted Vitest, typecheck and DEV H5 build. New APK only after integration; real-device AC remains a separate gate.

## Task 3: Website and admin report UI

Files: sites/nordic-public/src/analytics* and site/build integration; cloudbase/admin/analytics.js, analytics.css and food-images.html module mounting.

- [ ] Website tests: off before preference, allowlisted channels, no full URL/text, download untouched on transport failure, revoke stops queue.
- [ ] Add passive footer preferences and consented page/section/demo/download events; reuse existing locale/content controls. Preview build must point only to DEV; production build remains disabled until production release.
- [ ] Add admin eight-tab interactive report with date/platform/version/channel filters, true pagination, clear denominators/coverage/maturity/watermark, CSV and print-HTML manual reports. Reuse existing admin session/request/styles; no mail.
- [ ] Run Node module tests, website build and browser runtime checks. No fake data to substitute for empty real data.

## Task 4: Integration, verification and DEV delivery

Files: get-login-ticket/index.js routing and factory; deployment scripts/config only where necessary; verification report beside this plan.

- [ ] Wire bounded JSON analytics requests outside generic trace capture to prevent collecting raw bodies/tokens, existing Bearer verification for optional identity and existing admin guard for reports.
- [ ] Add route tests for unauthenticated reports, method guards, origin and body limits, safe failures, and no regression of business auth.
- [ ] Run backend tests, App tests/typecheck/build, website/admin checks, diff/security review. Fix failures before claiming pass.
- [ ] Deploy only verified DEV schema/function/admin and website preview; smoke test default-off, consent, replay/revoke, role denial and report totals with clearly tagged DEV test data.
- [ ] Package versioned DEV APK using existing package script and output contract; report artifact/signature separately from installation/real-device acceptance.
- [ ] Update this checklist and verification report with precise evidence and remaining real-device gates; scoped commits, no production merge/deploy.

## Review

AC01–AC04, AC13, AC16 → Tasks 1/2/3/4; AC05/06/11/15/17 → Task 2 plus real-device gate; AC07–AC10/12/18 → Task 1 and integration fixtures; AC14 → environment-bound build/deploy/readback. No historical activity is invented. Missing source observability must be labelled unknown.
