# Meal Detail Data Hero Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the no-image Meal Detail hero a compact, calm nutrition summary without changing data or Photo Hero behavior.

**Architecture:** Keep `MealDetailHero` as the data/photo switch boundary. Add decorative and macro-point markup only inside its Data Hero branch, and scope all visual changes beneath `.meal-detail-page__hero--data` in the existing page stylesheet.

**Tech Stack:** Taro React, TypeScript, SCSS, Vitest, Taro WeChat build.

---

### Task 1: Lock the visual contract

**Files:**
- Modify: `mini-program/tests/meal-detail-hero.test.ts`
- Modify: `mini-program/tests/meal-detail-score-summary.test.ts`

- [ ] **Step 1: Write the failing visual assertions**

```ts
expect(hero).toContain("meal-detail-page__data-hero-arc");
expect(hero).toContain("meal-detail-page__hero-macro-dot");
expect(styles).not.toContain(".meal-detail-page__hero--data .meal-detail-page__hero-macro-chip {\n  background: transparent;\n  border-left");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C mini-program exec vitest run tests/meal-detail-hero.test.ts tests/meal-detail-score-summary.test.ts`

Expected: FAIL because the Data Hero still has no arc or dot elements and retains its divider rule.

- [ ] **Step 3: Implement the minimal view and style changes**

Add a decorative `View` behind Data Hero calories. Render a dot beside every macro value only when the `data` variant is active. Remove the data-variant `border-left` and replace it with whitespace. Scope compact spacing and all tonal adjustments to `.meal-detail-page__hero--data`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C mini-program exec vitest run tests/meal-detail-hero.test.ts tests/meal-detail-score-summary.test.ts`

Expected: PASS.

### Task 2: Validate build output

**Files:**
- Modify: `mini-program/src/components/meal-detail-hero/index.tsx`
- Modify: `mini-program/src/styles/page.scss`

- [ ] **Step 1: Run static validation**

Run: `pnpm -C mini-program run typecheck && pnpm -C mini-program run lint`

Expected: both commands exit 0.

- [ ] **Step 2: Build the WeChat package**

Run: `pnpm -C mini-program run build:weapp`

Expected: `Compiled successfully` and refreshed `mini-program/dist/weapp/` output.
