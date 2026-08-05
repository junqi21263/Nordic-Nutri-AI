# Coach Draggable Scroll-top Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI coach return-to-top control a higher, translucent, draggable control whose position persists locally.

**Architecture:** Use a fixed Mini Program `MovableArea` and `MovableView` to provide native constrained dragging. Keep the persisted coordinate and click-versus-drag decision in the coach page, backed by Taro local storage and constrained against a screen area that excludes the header, composer, and tab bar.

**Tech Stack:** Taro React, WeChat Mini Program movable components, Taro local storage, SCSS, Vitest.

---

### Task 1: Draggable, persisted coach scroll-top control

**Files:**
- Modify: `mini-program/tests/coach-profile.test.ts`
- Modify: `mini-program/src/pages/coach/index.tsx`
- Modify: `mini-program/src/styles/page.scss`

- [x] **Step 1: Write the failing source-contract test**

```ts
expect(source).toContain("MovableArea");
expect(source).toContain("MovableView");
expect(source).toContain("Taro.getStorageSync(scrollTopPositionStorageKey)");
expect(source).toContain("Taro.setStorageSync(scrollTopPositionStorageKey");
expect(source).toContain("onChange={handleScrollTopPositionChange}");
expect(source).toContain("onTouchEnd={handleScrollTopTouchEnd}");
expect(styles).toContain("background: rgba($color-warm-white, 0.78);");
```

- [x] **Step 2: Run the focused test and verify it fails**

Run: `pnpm exec vitest run tests/coach-profile.test.ts`

Expected: FAIL because the existing fixed button has no movable container, storage, or translucent styling.

- [x] **Step 3: Add native drag, local persistence, and click separation**

```tsx
<MovableArea className="coach-chat__scroll-top-area">
  <MovableView
    className="coach-chat__scroll-top"
    direction="all"
    x={scrollTopPosition.x}
    y={scrollTopPosition.y}
    animation={false}
    onChange={handleScrollTopPositionChange}
    onTouchEnd={handleScrollTopTouchEnd}
  >
    <NordicIcon name="arrow-up" size={22} ariaLabel="回到顶部" />
  </MovableView>
</MovableArea>
```

The handlers update the coordinate from native drag changes, record whether movement exceeded the tap threshold, save the final coordinate with `Taro.setStorageSync`, and call `Taro.pageScrollTo` only for a non-drag tap.

- [x] **Step 4: Run focused and package verification**

Run: `pnpm exec vitest run tests/coach-profile.test.ts && pnpm typecheck && pnpm build:weapp && git diff --check`

Expected: all commands exit with status 0.
