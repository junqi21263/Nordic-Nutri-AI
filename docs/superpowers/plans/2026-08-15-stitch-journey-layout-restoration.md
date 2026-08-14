# Stitch Journey Layout Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the My Journey content region to the supplied Stitch layout while retaining the existing real header, data, and interactions.

**Architecture:** Only the Journey page CSS contract changes. The existing Journey components retain their live milestone state and illustration resolver; `page.scss` defines the Stitch-derived mobile layout, while the static Vitest contract prevents future rpx-scale regressions.

**Tech Stack:** Taro React, SCSS compiled to WXSS/rpx, Vitest, TypeScript, ESLint.

---

### Task 1: Lock the Stitch layout contract before changing styles

**Files:**
- Modify: `mini-program/tests/milestone-journey-stitch-contract.test.ts`

- [ ] **Step 1: Define the expected fixed visual structure**

Require the test to assert the Stitch-derived Hero image ratio, card illustration area, body area, and source CSS values that compile to the intended 390px rpx layout.

- [ ] **Step 2: Run the test to verify the current oversized-height implementation fails**

Run: `pnpm --filter @nordic-nutri-ai/mini-program exec vitest run tests/milestone-journey-stitch-contract.test.ts`

Expected: FAIL because the current `500rpx` Hero and `548rpx` card contract does not match the supplied Stitch structure.

### Task 2: Restore the supplied Stitch Hero and card layout

**Files:**
- Modify: `mini-program/src/styles/page.scss`

- [ ] **Step 1: Restore a content-driven Hero**

Use the original 60/40 copy/art composition, 4:5 Hero art container, source-appropriate rpx padding and progress rhythm. Do not modify page width, page behavior, or the real header.

- [ ] **Step 2: Restore the shared editorial card composition**

Give every card the same fixed image area and body layout as the Stitch source. Keep `aspectFill` in the existing illustration component, preserve state classes and only adjust their visual presentation.

- [ ] **Step 3: Run the visual contract test**

Run: `pnpm --filter @nordic-nutri-ai/mini-program exec vitest run tests/milestone-journey-stitch-contract.test.ts`

Expected: PASS.

### Task 3: Build the WeChat artifact and regression-check scope

**Files:**
- Generated: `mini-program/dist/weapp/`

- [ ] **Step 1: Run Journey regression tests**

Run: `pnpm --filter @nordic-nutri-ai/mini-program exec vitest run tests/milestone-journey-stitch-contract.test.ts tests/milestone-journey-pending-unlock.test.ts tests/milestone-journey-error-copy.test.ts`

Expected: PASS.

- [ ] **Step 2: Run static validation and build with Node 24**

Run: `env PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm --filter @nordic-nutri-ai/mini-program run lint && env PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm --filter @nordic-nutri-ai/mini-program run typecheck && env PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm --filter @nordic-nutri-ai/mini-program run build:weapp && env PATH=/opt/homebrew/opt/node@24/bin:$PATH pnpm --filter @nordic-nutri-ai/mini-program run verify:weapp`

Expected: all commands pass.

- [ ] **Step 3: Inspect only scoped edits**

Run: `git diff --check`

Expected: no whitespace errors; no business, CDN, Snapshot, claim, or interaction files changed.
