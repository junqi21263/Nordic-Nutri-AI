# Achievement Unlock Celebration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make achievement unlock celebrations full-screen, slower, and focused on the newly unlocked achievement.

**Architecture:** `AchievementUnlockOverlay` keeps its existing page-layout host and receives one full-screen particle layer behind the modal card. The component removes aggregate-progress markup; page-level SCSS controls the longer full-screen motion and improved title hierarchy.

**Tech Stack:** Taro React, TypeScript, SCSS, Vitest.

---

### Task 1: Lock the celebratory content contract

**Files:**
- Modify: `mini-program/tests/achievement-unlock-overlay.test.ts`
- Modify: `mini-program/src/components/achievement-unlock-overlay/index.tsx`

- [x] **Step 1: Write the failing content test**

```ts
expect(overlay).toContain("achievement-unlock-overlay__confetti");
expect(overlay).not.toContain("成长里程");
expect(overlay).toContain("收下这份成就");
expect(overlay).toContain("查看全部成就");
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --dir mini-program exec vitest run tests/achievement-unlock-overlay.test.ts`

Expected: failure because the old card still contains growth-progress markup and lacks the new labels.

- [x] **Step 3: Implement the focused content**

Add a full-screen confetti layer, remove the progress block, and replace the two action labels.

- [x] **Step 4: Run the test to verify it passes**

Run: `pnpm --dir mini-program exec vitest run tests/achievement-unlock-overlay.test.ts`

Expected: PASS.

### Task 2: Apply full-screen, slower confetti styling

**Files:**
- Modify: `mini-program/src/styles/page.scss`
- Test: `mini-program/tests/achievement-unlock-overlay.test.ts`

- [x] **Step 1: Extend the test with style contract assertions**

```ts
expect(pageStyles).toContain(".achievement-unlock-overlay__confetti");
expect(pageStyles).toContain("animation: achievement-unlock-particle 2800ms");
expect(pageStyles).toContain(".achievement-unlock-overlay__eyebrow");
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --dir mini-program exec vitest run tests/achievement-unlock-overlay.test.ts`

Expected: failure because particles are currently card-local and run for 720ms.

- [x] **Step 3: Implement the visual hierarchy**

Add an absolute full-screen confetti layer behind the modal card. Use a 2800ms downward keyframe with staggered delays, and increase the eyebrow contrast and size.

- [x] **Step 4: Run the test to verify it passes**

Run: `pnpm --dir mini-program exec vitest run tests/achievement-unlock-overlay.test.ts`

Expected: PASS.

### Task 3: Verify the Mini Program output

**Files:**
- Modify: `mini-program/src/components/achievement-unlock-overlay/index.tsx`
- Modify: `mini-program/src/styles/page.scss`
- Modify: `mini-program/tests/achievement-unlock-overlay.test.ts`

- [x] **Step 1: Run targeted regression tests**

Run: `pnpm --dir mini-program exec vitest run tests/achievement-unlock-overlay.test.ts tests/achievement-unlock-toast.test.ts`

Expected: all tests pass.

- [x] **Step 2: Run compile checks**

Run: `pnpm --dir mini-program typecheck && pnpm --dir mini-program build:weapp && pnpm --dir mini-program verify:weapp && git diff --check`

Expected: all commands exit 0.
