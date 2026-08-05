# Coach Scroll-top Edge Snap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Snap the draggable AI coach return-to-top button to the nearest horizontal edge when dragging ends, while preserving its vertical position and saved location.

**Architecture:** Keep the existing native movable control. A pure page helper chooses a left or right coordinate from the button center and current window width; the touch-end handler applies it with temporary native animation and persists the snapped coordinate.

**Tech Stack:** Taro React, WeChat Mini Program movable components, Taro local storage, SCSS, Vitest.

---

### Task 1: Snap draggable control to a horizontal edge

**Files:**
- Modify: `mini-program/tests/coach-profile.test.ts`
- Modify: `mini-program/src/pages/coach/index.tsx`

- [x] **Step 1: Write the failing source-contract test**

```ts
expect(source).toContain("function getSnappedScrollTopPosition");
expect(source).toContain("scrollTopControlSize / 2");
expect(source).toContain("animation={scrollTopSnapAnimating}");
expect(source).toContain("const snappedPosition = getSnappedScrollTopPosition");
expect(source).toContain("Taro.setStorageSync(scrollTopPositionStorageKey, snappedPosition)");
```

- [x] **Step 2: Run the focused test and verify it fails**

Run: `pnpm exec vitest run tests/coach-profile.test.ts`

Expected: FAIL because the current drag end persists its free position without edge snapping or animation.

- [x] **Step 3: Add the edge-snap helper and touch-end update**

```ts
const snappedPosition = getSnappedScrollTopPosition(scrollTopPositionRef.current);
setScrollTopSnapAnimating(true);
setScrollTopPosition(snappedPosition);
Taro.setStorageSync(scrollTopPositionStorageKey, snappedPosition);
```

The helper returns `x = edge inset` for the left half and `x = window width - button size - edge inset` for the right half, always retaining `y`.

- [x] **Step 4: Run focused and package verification**

Run: `pnpm exec vitest run tests/coach-profile.test.ts && pnpm typecheck && pnpm build:weapp && git diff --check`

Expected: all commands exit with status 0.
