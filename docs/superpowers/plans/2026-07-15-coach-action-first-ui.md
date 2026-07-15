# Coach Action-First UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine the Coach tab into a Chinese, action-first nutrition coaching experience while retaining the existing Nordic visual system and local chat behavior.

**Architecture:** Keep the page self-contained in `pages/coach/index.tsx`: its fixture-derived daily summary remains the source for the status and opening coach message. Recompose only the Coach page hierarchy and its scoped SCSS; quick actions and the suggested snack continue flowing through the existing `sendMessage` function.

**Tech Stack:** Taro 4, React, TypeScript, SCSS tokens, Vitest.

---

### Task 1: Lock the visual and interaction contract with a failing test

**Files:**
- Modify: `mini-program/tests/coach-profile.test.ts`

- [ ] **Step 1: Add a Coach-page source contract**

```ts
expect(source).toContain("今日还差");
expect(source).toContain("问问你的营养教练");
expect(source).toContain('className="coach-chat__status"');
expect(source).toContain('className="coach-chat__suggestion-product"');
expect(source).toContain('const quickPrompts = ["晚餐怎么补蛋白？", "查看今日进度"]');
```

- [ ] **Step 2: Verify the test fails before the UI changes**

Run: `pnpm --dir mini-program exec vitest run tests/coach-profile.test.ts`

Expected: the new source contract fails because the current page has the expanded journey header, three legacy quick prompts, and the NOVA input placeholder.

### Task 2: Recompose the Coach page around daily action

**Files:**
- Modify: `mini-program/src/pages/coach/index.tsx`

- [ ] **Step 1: Replace the expanded intro with a compact status line**

```tsx
<View className="coach-chat__status">
  <NordicIcon name="sparkles" size={17} ariaLabel="今日营养状态" />
  <Text>增肌目标 · 今日还差 {proteinLeft}g 蛋白质</Text>
</View>
```

- [ ] **Step 2: Keep the opening coach message as the conversational first action**

```tsx
{message.role === "coach" ? <NordicIcon name="bot" size={20} ariaLabel="你的营养教练" /> : null}
```

- [ ] **Step 3: Make the snack recommendation visibly actionable without new data dependencies**

```tsx
<View className="coach-chat__suggestion-product" onClick={() => sendMessage("我想把希腊酸奶加入今晚加餐")}>
  <View>
    <Text className="coach-chat__suggestion-product-name">希腊酸奶</Text>
    <Text className="coach-chat__suggestion-product-meta">约 20g 蛋白质</Text>
  </View>
  <NordicIcon name="circle-plus" size={24} ariaLabel="加入今晚加餐" />
</View>
```

- [ ] **Step 4: Limit quick actions and update the input wording**

```ts
const quickPrompts = ["晚餐怎么补蛋白？", "查看今日进度"];
```

```tsx
placeholder="问问你的营养教练，比如：晚餐吃什么？"
```

### Task 3: Tune the existing Coach styles to the reference hierarchy

**Files:**
- Modify: `mini-program/src/styles/page.scss`
- Modify: `mini-program/src/styles/layout.scss`

- [ ] **Step 1: Add only Coach-scoped styles for the status and product row**

```scss
.coach-chat__status {
  align-items: center;
  color: $color-text-secondary;
  display: flex;
  font-size: $font-caption;
  gap: $space-4;
  justify-content: center;
}

.coach-chat__suggestion-product {
  align-items: center;
  background: $color-surface;
  border-radius: $radius-16;
  display: flex;
  justify-content: space-between;
  padding: $space-12;
}
```

- [ ] **Step 2: Preserve the fixed composer and reserve its scroll space**

```scss
.page-layout--coach-chat .page-layout__content {
  padding-bottom: calc($tabbar-height + $safe-area-bottom + 136px);
}
```

- [ ] **Step 3: Use spacing changes only to remove the empty appearance; do not alter shared color tokens, font tokens, routes, or tab bar components.**

### Task 4: Verify source contract, types, lint, and WeChat build

**Files:**
- Test: `mini-program/tests/coach-profile.test.ts`

- [ ] **Step 1: Run the focused Coach regression test**

Run: `pnpm --dir mini-program exec vitest run tests/coach-profile.test.ts`

Expected: all Coach/profile tests pass.

- [ ] **Step 2: Run static validation**

Run: `pnpm --dir mini-program run typecheck && pnpm --dir mini-program run lint`

Expected: both commands exit successfully with no new diagnostics.

- [ ] **Step 3: Produce and validate the WeChat import target**

Run: `pnpm --dir mini-program run build:weapp && pnpm --dir mini-program run verify:weapp`

Expected: Taro compilation succeeds and the WXSS compatibility checker reports `passed`.
