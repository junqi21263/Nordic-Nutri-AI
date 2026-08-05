# Coach Scroll-top Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a persistent, accessible right-side icon on the AI coach page that smoothly returns the user to the top of the page.

**Architecture:** Keep the behavior inside the existing coach page, using Taro's page-level scroll API. Style the control alongside the existing coach-page styles so it remains fixed above the composer and bottom tab bar without changing the chat layout.

**Tech Stack:** Taro, React, SCSS, Vitest.

---

### Task 1: Fixed coach scroll-top control

**Files:**
- Modify: `mini-program/tests/coach-profile.test.ts`
- Modify: `mini-program/src/pages/coach/index.tsx`
- Modify: `mini-program/src/styles/page.scss`

- [x] **Step 1: Write the failing source-contract test**

```ts
expect(source).toContain('className="coach-chat__scroll-top"');
expect(source).toContain('ariaLabel="回到顶部"');
expect(source).toContain('Taro.pageScrollTo({ scrollTop: 0, duration: 300 })');
expect(styles).toContain('.coach-chat__scroll-top');
```

- [x] **Step 2: Run the focused test and verify it fails**

Run: `pnpm exec vitest run tests/coach-profile.test.ts`

Expected: FAIL because the right-side control is absent.

- [x] **Step 3: Add the minimal page behavior and visual control**

```tsx
const scrollToCoachTop = () => {
  void Taro.pageScrollTo({ scrollTop: 0, duration: 300 });
};

<View className="coach-chat__scroll-top" ariaLabel="回到顶部" onClick={scrollToCoachTop}>
  <NordicIcon name="arrow-up" size={22} ariaLabel="回到顶部" />
</View>
```

```scss
.coach-chat__scroll-top {
  position: fixed;
  right: $space-16;
  z-index: 90;
}
```

- [x] **Step 4: Run focused and package verification**

Run: `pnpm exec vitest run tests/coach-profile.test.ts && pnpm typecheck && pnpm build:weapp && git diff --check`

Expected: all commands exit with status 0.
