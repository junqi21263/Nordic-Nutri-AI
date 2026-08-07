# Achievement Animation Only Tuning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore the pre-Stitch achievement card and copy exactly, then make only the two-sided Canvas celebration denser and slower.

**Architecture:** `AchievementUnlockModal` will return to the UI values that existed before commit `70dd61e`; it will keep the Canvas overlay as the only animation implementation. `AchievementConfettiCanvas` will own both particle density and motion-rate constants, so no visual-content code is touched when celebration timing changes.

**Tech Stack:** Taro React, TypeScript, WeChat Canvas 2D, Vitest, Sass.

---

### Task 1: Lock the original card contract with a failing test

**Files:**
- Modify: `mini-program/tests/achievement-unlock-overlay.test.ts`
- Modify: `mini-program/src/components/achievement-unlock-modal/index.tsx`
- Modify: `mini-program/src/styles/page.scss`

- [x] **Step 1: Write the failing test**

Add assertions for the pre-`70dd61e` card values: `size={52}`, `收下这份成就`, `查看全部成就`, `max-width: 620px`, `width: 88%`, and the original card content does not include the newly introduced static `1 / 20` progress row.

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/achievement-unlock-overlay.test.ts`

Expected: FAIL because the current card uses the Stitch card width, changed labels, and progress row.

- [x] **Step 3: Restore only the card presentation**

Restore the modal JSX and card Sass values from `HEAD^` for the icon size, labels, card width, close target, and content spacing. Keep `AchievementConfettiCanvas` mounted above the card; do not restore the old CSS particle elements.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/achievement-unlock-overlay.test.ts`

Expected: PASS.

### Task 2: Increase only particle density and duration

**Files:**
- Modify: `mini-program/tests/achievement-unlock-overlay.test.ts`
- Modify: `mini-program/src/components/achievement-confetti-canvas/index.tsx`

- [x] **Step 1: Write the failing test**

Require `particleCountPerSide = 60` and a named motion scale of `0.66`, confirming the animation renders about 1.5x slower without changing ballistic directions.

- [x] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/achievement-unlock-overlay.test.ts`

Expected: FAIL because the current value is 40 and no timing scale is present.

- [x] **Step 3: Implement the narrow motion change**

Set each side to 60 particles. Introduce `motionRate = 0.66`; multiply each frame's velocity, gravity, and rotation advance by that rate. The particle start locations, launch angles, colours and natural lower-edge fade stay unchanged.

- [x] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/achievement-unlock-overlay.test.ts`

Expected: PASS.

### Task 3: Verify WeChat output and deliver

**Files:**
- Verify: `mini-program/dist/weapp/`

- [x] **Step 1: Run the full automated suite**

Run: `pnpm run test:unit && pnpm run lint && pnpm run typecheck`

Expected: all tests, lint and TypeScript checks pass.

- [x] **Step 2: Build and check WXSS**

Run: `pnpm run build:weapp && pnpm run verify:weapp && git diff --check`

Expected: Taro compilation and WXSS compatibility checks pass with no whitespace errors.

- [x] **Step 3: Commit the bounded change**

Run: `git add ... && git commit -m "fix: tune achievement celebration only"`

Expected: one commit containing only the card restoration, Canvas timing/density adjustment, test and this plan.
