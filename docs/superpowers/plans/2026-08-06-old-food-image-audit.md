# Old Food Image Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a safe, reviewable old-image audit workflow that identifies high-risk processed foods, verifies current primary images with Qwen VL, and creates new candidates only after an administrator requests regeneration.

**Architecture:** A dedicated audit service will persist immutable audit runs and items in CloudBase PG. It will reuse the Food Image Prompt Engine for expected visual types, a new structured Qwen VL audit adapter for image comparison, and the existing `foodImageJobs.regenerate` flow for new candidate creation. The existing admin `食材生图` module gains an audit composer, audit queue, and inspector state without replacing its batch-review workspace.

**Tech Stack:** Node.js CommonJS cloud function, CloudBase PostgreSQL/RDB, Qwen VL compatible API, Hunyuan image job service, static HTML admin console, Node built-in test runner.

---

## File structure

- Create `cloudbase/functions/get-login-ticket/food-image-audit-service.cjs`: high-risk selection, audit persistence, AI review, keep/retry actions.
- Create `cloudbase/functions/get-login-ticket/food-image-audit-service.test.mjs`: service-level TDD coverage with RDB and model doubles.
- Create `cloudbase/functions/get-login-ticket/food-image-audit-vision.cjs`: strict JSON request/response adapter dedicated to old-image audit.
- Create `cloudbase/functions/get-login-ticket/food-image-audit-vision.test.mjs`: audit result validation and provider request tests.
- Create `cloudbase/pg/migrations/0038_food_image_audits.sql`: server-only audit tables, constraints, indexes, triggers and RLS.
- Create `cloudbase/pg/migrations/0038_food_image_audits.test.mjs`: migration contract checks.
- Modify `cloudbase/functions/get-login-ticket/food-repository.cjs`: expose read-only, paginated existing-primary-image candidates for audit, including tags and category metadata.
- Modify `cloudbase/functions/get-login-ticket/food-repository.test.mjs`: verify that only ready approved primary images are returned.
- Modify `cloudbase/functions/get-login-ticket/index.js`: compose audit dependencies and expose administrator-only routes.
- Modify `cloudbase/functions/get-login-ticket/index.test.mjs`: verify route dispatch and request bodies.
- Modify `cloudbase/admin/food-images.html`: add an old-image audit card, queue mode and inspector actions aligned to current admin UI.
- Modify `cloudbase/admin/food-images.test.mjs`: static UI/API contract assertions.
- Modify `docs/FOOD_IMAGE_GENERATION.md`: document audit lifecycle and operator safety rules.

### Task 1: Add the database contract

**Files:**
- Create: `cloudbase/pg/migrations/0038_food_image_audits.sql`
- Create: `cloudbase/pg/migrations/0038_food_image_audits.test.mjs`

- [ ] **Step 1: Write the failing migration contract test**

```js
test("food image audit migration keeps reviews server-only and never replaces primary images", () => {
  const sql = readFileSync(new URL("./0038_food_image_audits.sql", import.meta.url), "utf8");
  assert.match(sql, /create table if not exists public\.food_image_audit_runs/i);
  assert.match(sql, /create table if not exists public\.food_image_audit_items/i);
  assert.match(sql, /check \(status in \('pending_review','ai_pass','needs_review','failed','kept','regeneration_requested'\)\)/i);
  assert.match(sql, /revoke all on public\.food_image_audit_runs/i);
  assert.doesNotMatch(sql, /update public\.food_images.*is_primary/i);
});
```

- [ ] **Step 2: Run the migration test and verify RED**

Run: `node --test cloudbase/pg/migrations/0038_food_image_audits.test.mjs`

Expected: FAIL because migration file does not exist.

- [ ] **Step 3: Add additive audit tables**

Create `food_image_audit_runs` with `id`, `scope` fixed to `high_risk_processed`, `status` (`previewed`, `reviewing`, `completed`, `completed_with_errors`), `requested_count`, `candidate_count`, `reviewed_count`, `created_by`, timestamps. Create `food_image_audit_items` with foreign keys to run, food, old primary image and optional regeneration job; snapshot `image_url`, `visual_type`, `decision_source`, `matched_keywords`, `risk_reasons`, `prompt_plan_json`, `ai_result_json`, `ai_confidence`, `status`, `operator_decision`, timestamps. Add indexes on `(run_id,status)`, `(food_id,created_at desc)`, and `old_image_id`; apply `set_updated_at`, RLS, revoke-all and server-only policies to both tables.

- [ ] **Step 4: Run the migration test and verify GREEN**

Run: `node --test cloudbase/pg/migrations/0038_food_image_audits.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the migration**

```bash
git add cloudbase/pg/migrations/0038_food_image_audits.sql cloudbase/pg/migrations/0038_food_image_audits.test.mjs
git commit -m "feat: add food image audit schema"
```

### Task 2: Expose existing approved primary images for a read-only audit

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/food-repository.cjs`
- Modify: `cloudbase/functions/get-login-ticket/food-repository.test.mjs`

- [ ] **Step 1: Write failing repository tests**

```js
test("listExistingPrimaryImagesForAudit excludes pending and non-primary images", async () => {
  const repo = createFoodRepository({ db: mockDb({ /* ready + pending fixtures */ }) });
  const result = await repo.listExistingPrimaryImagesForAudit({ limit: 20 });
  assert.deepEqual(result.items.map((item) => item.image.id), ["ready-primary"]);
  assert.equal(result.items[0].food.nameZh, "低热量水果味饮料粉");
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --test cloudbase/functions/get-login-ticket/food-repository.test.mjs`

Expected: FAIL because `listExistingPrimaryImagesForAudit` is not defined.

- [ ] **Step 3: Implement the narrow repository method**

Add `listExistingPrimaryImagesForAudit({ limit = 50, cursor })` to return only active/published foods with a ready, approved primary image. Reuse `mapFoodRow`, `mapImageRow`, category/tag loading and storage URL resolution. Return `{ items, nextCursor }`; do not update `foods`, `food_images`, or visual profiles.

- [ ] **Step 4: Run repository tests and verify GREEN**

Run: `node --test cloudbase/functions/get-login-ticket/food-repository.test.mjs`

Expected: PASS, including the new exclusion test.

- [ ] **Step 5: Commit repository support**

```bash
git add cloudbase/functions/get-login-ticket/food-repository.cjs cloudbase/functions/get-login-ticket/food-repository.test.mjs
git commit -m "feat: list existing images for audit"
```

### Task 3: Add a dedicated Qwen image-audit adapter

**Files:**
- Create: `cloudbase/functions/get-login-ticket/food-image-audit-vision.cjs`
- Create: `cloudbase/functions/get-login-ticket/food-image-audit-vision.test.mjs`

- [ ] **Step 1: Write failing adapter tests**

```js
test("audit vision returns fail when a drink powder image contains whole fruit", async () => {
  const audit = createFoodImageAuditVision({ requestCompletion: async () => JSON.stringify({ verdict: "fail", detectedSubject: "完整水果", confidence: 0.96, reasons: ["主体与饮料粉不符"] }) });
  const result = await audit({ imageUrl: "https://cdn.example/powder.jpg", expectedVisualType: "drink_powder", foodNameZh: "低热量水果味饮料粉" });
  assert.equal(result.verdict, "fail");
  assert.equal(result.detectedSubject, "完整水果");
});
```

- [ ] **Step 2: Run the adapter test and verify RED**

Run: `node --test cloudbase/functions/get-login-ticket/food-image-audit-vision.test.mjs`

Expected: FAIL because the adapter module does not exist.

- [ ] **Step 3: Implement strict audit parsing and provider request**

Export `createFoodImageAuditVision` and `validateAuditResult`. The model prompt must request JSON only: `verdict` (`pass`, `needs_review`, `fail`), `detectedSubject`, `confidence` in `[0,1]`, and up to five concise Chinese `reasons`. Use a zero-temperature image request with the expected visual type, food names and matched keywords. Reject malformed results with `FOOD_IMAGE_AUDIT_RESULT_INVALID`; map transport/provider failures to `FOOD_IMAGE_AUDIT_VISION_RETRYABLE`. Do not reuse nutrition-meal validation from `qwen-vision-service.cjs`.

- [ ] **Step 4: Run adapter tests and verify GREEN**

Run: `node --test cloudbase/functions/get-login-ticket/food-image-audit-vision.test.mjs`

Expected: PASS for valid pass/fail, malformed JSON and bounded confidence.

- [ ] **Step 5: Commit the adapter**

```bash
git add cloudbase/functions/get-login-ticket/food-image-audit-vision.cjs cloudbase/functions/get-login-ticket/food-image-audit-vision.test.mjs
git commit -m "feat: add food image audit vision adapter"
```

### Task 4: Implement audit lifecycle service with no automatic replacement

**Files:**
- Create: `cloudbase/functions/get-login-ticket/food-image-audit-service.cjs`
- Create: `cloudbase/functions/get-login-ticket/food-image-audit-service.test.mjs`

- [ ] **Step 1: Write failing lifecycle tests**

```js
test("previewHighRisk selects processed forms and leaves food images unchanged", async () => {
  const service = createFoodImageAuditService({ db, repository, auditVision, jobs, requireAdmin: async () => {} });
  const preview = await service.previewHighRisk("admin-1", { count: 20 });
  assert.equal(preview.items[0].visualType, "drink_powder");
  assert.match(preview.items[0].riskReasons.join(" "), /加工食品/);
  assert.equal(db.updatedFoodImages, 0);
});

test("requestRegeneration records job id without changing old image primary state", async () => {
  const result = await service.requestRegeneration("admin-1", "audit-item-1", { visualType: "alcohol_bottle" });
  assert.equal(result.status, "regeneration_requested");
  assert.equal(result.regenerationJobId, "job-1");
  assert.equal(db.updatedFoodImages, 0);
});
```

- [ ] **Step 2: Run lifecycle tests and verify RED**

Run: `node --test cloudbase/functions/get-login-ticket/food-image-audit-service.test.mjs`

Expected: FAIL because the service module does not exist.

- [ ] **Step 3: Implement preview, review, keep and regeneration actions**

Implement `previewHighRisk`, `listRun`, `reviewItems`, `keepItem`, and `requestRegeneration`. `previewHighRisk` resolves each repository candidate with `resolveFoodVisualType`, retains only the documented processed types, derives explicit reasons from complete-form keyword matches, snapshots `buildFoodImagePromptPlan`, and inserts rows as `pending_review`. `reviewItems` calls the audit adapter per selected item, writes verdict/result and status (`ai_pass`, `needs_review`, `failed`), and never touches the old image. `keepItem` sets `kept`. `requestRegeneration` validates optional visual type against `FOOD_VISUAL_TYPES`, persists the override through repository update only when supplied, calls `jobs.regenerate`, and writes `regeneration_requested` plus the returned job ID.

- [ ] **Step 4: Run lifecycle tests and verify GREEN**

Run: `node --test cloudbase/functions/get-login-ticket/food-image-audit-service.test.mjs`

Expected: PASS for high-risk selection, model failure isolation, keep action and delayed replacement.

- [ ] **Step 5: Commit the service**

```bash
git add cloudbase/functions/get-login-ticket/food-image-audit-service.cjs cloudbase/functions/get-login-ticket/food-image-audit-service.test.mjs
git commit -m "feat: add old food image audit lifecycle"
```

### Task 5: Wire administrator routes and cloud-function dependencies

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Modify: `cloudbase/functions/get-login-ticket/index.test.mjs`

- [ ] **Step 1: Write failing HTTP-route tests**

```js
test("admin audit preview routes to the audit service", async () => {
  const response = await requestAdmin("POST", "/api/admin/food-image-audits/preview", { count: 20 });
  assert.equal(response.statusCode, 200);
  assert.equal(mockAudit.previewCalls[0].count, 20);
});
```

- [ ] **Step 2: Run route tests and verify RED**

Run: `node --test cloudbase/functions/get-login-ticket/index.test.mjs`

Expected: FAIL with `404` because audit routes are absent.

- [ ] **Step 3: Compose and route audit service**

Create the audit adapter from server-only Qwen configuration and inject it with repository, jobs and `allowAdminConsole`. Add routes: `POST /food-image-audits/preview`, `GET /food-image-audits/:runId`, `POST /food-image-audits/:runId/review`, `POST /food-image-audit-items/:itemId/keep`, `POST /food-image-audit-items/:itemId/regenerate`. Enforce existing admin session parsing, clamp preview count to `20|50|100`, selected review IDs to 100, and return existing error JSON conventions.

- [ ] **Step 4: Run route tests and verify GREEN**

Run: `node --test cloudbase/functions/get-login-ticket/index.test.mjs`

Expected: PASS for authorization, preview, AI review, keep and regeneration dispatch.

- [ ] **Step 5: Commit routes**

```bash
git add cloudbase/functions/get-login-ticket/index.js cloudbase/functions/get-login-ticket/index.test.mjs
git commit -m "feat: expose food image audit admin routes"
```

### Task 6: Add the audit workspace to the existing admin UI

**Files:**
- Modify: `cloudbase/admin/food-images.html`
- Modify: `cloudbase/admin/food-images.test.mjs`

- [ ] **Step 1: Write failing static UI contract tests**

```js
test("food image admin exposes old-image audit controls and safe actions", () => {
  const html = readFileSync(new URL("./food-images.html", import.meta.url), "utf8");
  assert.match(html, /id="auditPreview"/);
  assert.match(html, /id="auditRunReview"/);
  assert.match(html, /加入重生队列/);
  assert.match(html, /保留旧图/);
  assert.match(html, /food-image-audits\/preview/);
});
```

- [ ] **Step 2: Run UI tests and verify RED**

Run: `node --test cloudbase/admin/food-images.test.mjs`

Expected: FAIL because audit controls and API references do not exist.

- [ ] **Step 3: Implement audit composer, queue mode and inspector**

Add a composer card above the existing batch controls with scope label “高风险加工食品”, count selector (20/50/100), `预览风险项` and disabled-until-preview `执行 AI 复核` controls. Add `state.auditRun`, `state.auditItems`, and selected IDs; render audit items in the existing central queue style when audit mode is active, showing old image, risk reasons, expected visual type and result badges. Extend the right inspector with old image, prompt diagnostics, AI result, `保留旧图`, existing visual type override select and `加入重生队列`. Every destructive-looking action needs an explicit browser confirmation; use the current operation feed and toast helpers; route new candidates back to the standard batch/review workspace.

- [ ] **Step 4: Run UI tests and verify GREEN**

Run: `node --test cloudbase/admin/food-images.test.mjs`

Expected: PASS, then run `node -e 'new Function(require("node:fs").readFileSync("cloudbase/admin/food-images.html", "utf8").match(/<script>([\s\S]*)<\/script>/)[1])'` with exit code 0.

- [ ] **Step 5: Commit the UI**

```bash
git add cloudbase/admin/food-images.html cloudbase/admin/food-images.test.mjs
git commit -m "feat: add old image audit workspace"
```

### Task 7: Document and verify the complete feature

**Files:**
- Modify: `docs/FOOD_IMAGE_GENERATION.md`

- [ ] **Step 1: Document operator workflow**

Add: preview only reads old images; AI review is advisory; manual `保留旧图` or `加入重生队列` decisions; candidates require existing approval before primary-image replacement; max 100 AI-review items per operation; failed audit items may be retried.

- [ ] **Step 2: Run all focused tests**

Run:

```bash
node --test cloudbase/functions/get-login-ticket/food-image-audit-vision.test.mjs cloudbase/functions/get-login-ticket/food-image-audit-service.test.mjs cloudbase/functions/get-login-ticket/food-repository.test.mjs cloudbase/functions/get-login-ticket/index.test.mjs cloudbase/pg/migrations/0038_food_image_audits.test.mjs cloudbase/admin/food-images.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 3: Run project verification**

Run:

```bash
node --test cloudbase/functions/get-login-ticket/*.test.mjs cloudbase/pg/migrations/*.test.mjs cloudbase/admin/*.test.mjs
pnpm run typecheck:mini-program
pnpm --dir mini-program build:weapp
git diff --check
```

Expected: all commands exit 0; report Node engine warnings separately if present.

- [ ] **Step 4: Commit documentation and verification result**

```bash
git add docs/FOOD_IMAGE_GENERATION.md
git commit -m "docs: document old image audit workflow"
```

- [ ] **Step 5: Deploy only after explicit user confirmation**

Apply `0038_food_image_audits.sql` through CloudBase PG, verify tables/RLS by read-only query, update only the `get-login-ticket` function code, verify `Active / Available`, then push verified commits to `origin/main`. Do not deploy before the user explicitly confirms deployment scope.
