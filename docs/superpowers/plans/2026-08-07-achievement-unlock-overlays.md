# Achievement Unlock Overlays Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace achievement toast-only feedback with a queued natural celebration overlay and make locked achievement details actionable, without changing achievement definitions, database data, or list layout.

**Architecture:** The achievement store will surface a one-at-a-time `achievementUnlocked` event derived from the existing seen-ID comparison. A root-level overlay consumes that event and is therefore independent of the page that caused a refresh. `AchievementDetailSheet` continues to handle manual taps and gains a record action for locked achievements.

**Tech Stack:** Taro, React, TypeScript, Zustand, SCSS, Vitest, WeChat Mini Program build.

---

### Task 1: Define a queued unlock event in the achievement store

**Files:**
- Modify: `mini-program/src/stores/achievement-store.ts`
- Modify: `mini-program/tests/achievement-unlock-toast.test.ts`

- [ ] **Step 1: Write failing event-queue tests**

Add tests that call `setAchievements` after bootstrap and assert the state exposes one new item at a time:

```ts
expect(store.getState().achievementUnlocked).toEqual({ achievementId: "achievement-1" });
store.getState().dismissAchievementUnlocked();
expect(store.getState().achievementUnlocked).toBeNull();
```

Add a second test with two newly-unlocked IDs; after dismissing the first, assert the second becomes active. Keep the existing assertion that the bootstrap write creates no event.

- [ ] **Step 2: Run the test to verify it fails**

Run `pnpm --dir mini-program test:unit --run tests/achievement-unlock-toast.test.ts`.

Expected: FAIL because the store currently exposes only a toast announcer and no event state.

- [ ] **Step 3: Add minimal event queue state**

Add these types and store members:

```ts
export interface AchievementUnlockedEvent { achievementId: string; }
achievementUnlocked: AchievementUnlockedEvent | null;
pendingAchievementUnlocks: AchievementUnlockedEvent[];
dismissAchievementUnlocked: () => void;
```

When `setAchievements` identifies newly unlocked IDs, append them in source order. Set `achievementUnlocked` to the first pending item only when no event is active. `dismissAchievementUnlocked` promotes the next item or clears the active event. Remove the user-visible toast call so the overlay is the only notification path.

- [ ] **Step 4: Verify the store tests pass**

Run `pnpm --dir mini-program test:unit --run tests/achievement-unlock-toast.test.ts`.

Expected: PASS, including bootstrap silence and ordered event delivery.

### Task 2: Add a global achievement celebration overlay

**Files:**
- Create: `mini-program/src/components/achievement-unlock-overlay/index.tsx`
- Modify: `mini-program/src/app.tsx`
- Modify: `mini-program/src/styles/page.scss`
- Create: `mini-program/tests/achievement-unlock-overlay.test.ts`

- [ ] **Step 1: Write failing component-contract tests**

Assert the component reads `achievementUnlocked`, resolves the current achievement by ID, exposes `继续记录` and `查看成长里程`, and uses CSS classes `achievement-unlock-overlay`, `achievement-unlock-overlay__card`, and `achievement-unlock-overlay__particle`.

- [ ] **Step 2: Run the test to verify it fails**

Run `pnpm --dir mini-program test:unit --run tests/achievement-unlock-overlay.test.ts`.

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the overlay**

Render nothing without an active event or matching achievement. Otherwise render a full-screen backdrop and a centered card containing:

```tsx
<Text className="achievement-unlock-overlay__eyebrow">成就已解锁</Text>
<Text className="achievement-unlock-overlay__title">{achievement.title}</Text>
<Text className="achievement-unlock-overlay__copy">
  {achievement.requirement || getAchievementRequirement(achievement.title)}
</Text>
```

Show the existing achievement icon, a `已解锁数 / 总成就数` progress line, `继续记录` to dismiss, and `查看成长里程` to dismiss then `Taro.navigateTo({ url: "/pages/achievements/index" })`. Render six static particle Views, each assigned a distinct modifier class. Use existing `getAchievementIcon`, `getAchievementRequirement`, and `useAchievementStore`.

- [ ] **Step 4: Mount it once in `App`**

Add `<AchievementUnlockOverlay />` after `<FeedbackHost />` inside `AppLayout` so every achievement-refresh origin shares the same overlay.

- [ ] **Step 5: Add motion styles**

Define a backdrop, card pop-in, icon glow and six small leaf/dot particle transforms. Use only `opacity` and `transform`, cap entrance to 360ms, and set the overlay z-index above sheets and the tab bar.

- [ ] **Step 6: Verify overlay tests pass**

Run `pnpm --dir mini-program test:unit --run tests/achievement-unlock-toast.test.ts tests/achievement-unlock-overlay.test.ts`.

Expected: PASS.

### Task 3: Make the locked achievement detail actionable

**Files:**
- Modify: `mini-program/src/components/achievement-detail-sheet/index.tsx`
- Modify: `mini-program/src/styles/page.scss`
- Modify: `mini-program/tests/achievement-detail.test.ts`

- [ ] **Step 1: Write failing detail-sheet assertions**

Add assertions that the sheet includes `去记录第一餐`, `去记录下一餐`, and `Taro.switchTab({ url: "/pages/meal-records/index" })`, while retaining `解锁目标`, `当前进度`, and `达成时间`.

- [ ] **Step 2: Run test to verify it fails**

Run `pnpm --dir mini-program test:unit --run tests/achievement-detail.test.ts`.

Expected: FAIL because the current sheet only provides a passive close hint.

- [ ] **Step 3: Implement the action**

Import `Taro`. For a locked, available achievement, render a full-width action after the progress card. Select its label from `achievement.metric`: `去记录第一餐` when its numeric value is zero; otherwise `去记录下一餐`. On tap, call `onDismiss()` and then `Taro.switchTab({ url: "/pages/meal-records/index" })`. Preserve completed-date presentation and do not render the action for completed or unavailable achievements.

- [ ] **Step 4: Refine the locked presentation**

Retain the lock badge and add a subtle `achievement-detail__next-action` button in forest green. Keep the existing pale metric card; no rewards, coins, ranks, or competitive copy.

- [ ] **Step 5: Verify detail tests pass**

Run `pnpm --dir mini-program test:unit --run tests/achievement-detail.test.ts`.

Expected: PASS.

### Task 4: Run full Mini Program validation and commit

**Files:**
- Verify: `mini-program/src/stores/achievement-store.ts`
- Verify: `mini-program/src/components/achievement-unlock-overlay/index.tsx`
- Verify: `mini-program/src/components/achievement-detail-sheet/index.tsx`
- Verify: `mini-program/src/app.tsx`
- Verify: `mini-program/src/styles/page.scss`

- [ ] **Step 1: Run complete validation**

Run `pnpm --dir mini-program test:unit && pnpm --dir mini-program typecheck && pnpm --dir mini-program build:weapp && pnpm --dir mini-program verify:weapp && git diff --check`.

Expected: all tests, type checking, build, WXSS verification, and whitespace check pass.

- [ ] **Step 2: Perform WeChat Developer Tools visual acceptance**

Import `mini-program/dist/weapp/`; cause a new achievement in a non-bootstrap session; confirm only one centered celebration overlay appears, it closes immediately, next queued unlock follows, and no toast duplicates it. Tap a locked achievement and confirm the bottom sheet shows lock, condition, progress, and record action; tap a completed achievement and confirm it shows date only.

- [ ] **Step 3: Commit implementation**

Run `git add mini-program/src/stores/achievement-store.ts mini-program/src/components/achievement-unlock-overlay/index.tsx mini-program/src/components/achievement-detail-sheet/index.tsx mini-program/src/app.tsx mini-program/src/styles/page.scss mini-program/tests/achievement-unlock-toast.test.ts mini-program/tests/achievement-unlock-overlay.test.ts mini-program/tests/achievement-detail.test.ts && git commit -m "feat: celebrate achievement unlocks"`.
