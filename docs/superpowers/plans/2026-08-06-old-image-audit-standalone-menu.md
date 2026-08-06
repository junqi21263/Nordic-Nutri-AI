# Old Image Audit Standalone Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move historical food-image auditing into its own admin menu while preserving the existing audit lifecycle and regeneration workflow.

**Architecture:** `cloudbase/admin/food-images.html` remains the single static admin page. The audit controls and state stay client-side and use the existing audit endpoints; only the module boundary and candidate presentation change. Regeneration continues through the server-side job service, which compiles the current Food Image Prompt Engine plan when the job is created.

**Tech Stack:** Static HTML/CSS/JavaScript, Node `node:test`, CloudBase Hosting.

---

### Task 1: Lock the standalone audit workspace contract

**Files:**
- Modify: `cloudbase/admin/food-images.test.mjs`
- Modify: `cloudbase/admin/food-images.html`

- [ ] **Step 1: Write the failing static-page test**

```js
test("old image audit is a standalone admin module with explicit latest-prompt regeneration copy", () => {
  assert.match(html, /data-module="audit"[^>]*>旧图审计/);
  assert.match(html, /id="moduleAudit" class="admin-module" hidden/);
  assert.doesNotMatch(imagesModule, /aria-label="历史主图审计"/);
  assert.match(html, /重新生图会使用当前最新的食物视觉形态提示词/);
});
```

- [ ] **Step 2: Run the focused test and confirm it fails**

Run: `node --test cloudbase/admin/food-images.test.mjs --test-name-pattern "standalone admin module"`

Expected: FAIL because the audit card is still inside `moduleImages`.

- [ ] **Step 3: Implement the minimum page move**

```html
<button type="button" class="admin-nav__item" data-module="audit">旧图审计</button>
<section id="moduleAudit" class="admin-module" hidden>…existing audit controls…</section>
```

Extend `setModule` to show `moduleAudit` only for `audit`; keep all existing `auditPreview`, `auditRunReview`, `keepAuditItem`, and `regenerateAuditItem` handlers unchanged.

- [ ] **Step 4: Verify focused and full static tests**

Run: `node --test cloudbase/admin/food-images.test.mjs`

Expected: PASS.

### Task 2: Publish the focused static-page update

**Files:**
- Modify: `cloudbase/admin/food-images.html`
- Modify: `cloudbase/admin/food-images.test.mjs`

- [ ] **Step 1: Verify inline script syntax and diff hygiene**

Run: `node --check <(sed -n '/<script>/,/<\\/script>/p' cloudbase/admin/food-images.html | sed '1d;$d')` and `git diff --check`

Expected: both exit successfully.

- [ ] **Step 2: Deploy only the existing static path**

Run: `tcb hosting deploy cloudbase/admin/food-images.html /admin/food-images.html --env-id lewis-healthy-d4glgqqzv73a5bc10 --yes`

Expected: only `/admin/food-images.html` is overwritten; no function, database, permission, or environment-variable change.

- [ ] **Step 3: Verify CDN content and Git delivery**

Run: fetch the hosted page with a cache-busting query and assert `data-module="audit"`; then commit and push the two changed static-page files to `main`.

Expected: hosted source contains the standalone menu and `origin/main` matches the new commit.
