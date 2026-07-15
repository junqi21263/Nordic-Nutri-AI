# Home Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Home dashboard to match the fourth Stitch reference while retaining current dynamic meal data and Mini Program navigation.

**Architecture:** Keep `HomePage` as the composition boundary. Enhance `DailyNutritionSummary` into the target-card visual layout and use existing `MealGroup` data rendering for meals. Scope all visual rules under `.home-page` so other pages retain their existing styles.

**Tech Stack:** Taro React, TypeScript, SCSS, Vitest, WeChat Mini Program.

---

### Task 1: Protect the dashboard composition with a contract test

**Files:**
- Modify: `mini-program/tests/four-page-stitch-contract.test.ts`
- Test: `mini-program/tests/four-page-stitch-contract.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
expect(source).toContain('className="home-page__target"');
expect(source).toContain('className="home-page__meal-list"');
expect(styles).toContain('.home-page__target-ring');
expect(styles).toContain('.home-page__meal-list');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @nordic-nutri-ai/mini-program test:unit -- four-page-stitch-contract`

Expected: FAIL because the Home target and meal-list hooks are absent.

- [ ] **Step 3: Implement the smallest dashboard structure**

```tsx
<View className="home-page__target">
  <View className="home-page__target-ring" />
  <DailyNutritionSummary summary={summary} />
</View>
<View className="home-page__meal-list">...</View>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @nordic-nutri-ai/mini-program test:unit -- four-page-stitch-contract`

Expected: PASS.

### Task 2: Build the daily-target hierarchy

**Files:**
- Modify: `mini-program/src/pages/home/index.tsx`
- Modify: `mini-program/src/components/daily-nutrition-summary/index.tsx`
- Modify: `mini-program/src/styles/page.scss`

- [ ] **Step 1: Add the target card composition**

```tsx
<View className="home-page__target">
  <Text className="home-page__target-title">今日目标</Text>
  <DailyNutritionSummary summary={summary} variant="dashboard" />
</View>
```

- [ ] **Step 2: Render a calculated remaining-calorie ring and macro rows**

```tsx
const remaining = Math.max(0, summary.calories - summary.consumed.calories);
<View className="daily-summary__dashboard-ring">
  <Text>{remaining}</Text><Text>剩余</Text>
</View>
```

- [ ] **Step 3: Scope dashboard sizing under the page namespace**

```scss
.home-page__target-card { background: $stitch-surface-warm; border-radius: 28px; }
.home-page__target-ring { border: 10px solid rgba($stitch-brand-green, .13); border-top-color: $stitch-brand-green; }
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @nordic-nutri-ai/mini-program test:unit`

Expected: PASS.

### Task 3: Recompose insight, actions, and meal presentation

**Files:**
- Modify: `mini-program/src/pages/home/index.tsx`
- Modify: `mini-program/src/components/meal-group/index.tsx`
- Modify: `mini-program/src/styles/page.scss`
- Modify: `mini-program/src/styles/components.scss`

- [ ] **Step 1: Keep actions as equally sized 54px controls**

```scss
.home-page__actions { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.home-page__action { min-height: 54px; }
```

- [ ] **Step 2: Style meals as compact thumbnail rows with an edit affordance**

```tsx
<View className="meal-group__right">
  <Text className="meal-group__kcal">{nutrition.calories} kcal</Text>
  <NordicIcon name="pencil" size={16} ariaLabel="编辑餐次" />
</View>
```

- [ ] **Step 3: Render the empty meal group as a dashed log-meal action**

```scss
.home-page .meal-group__empty { border: 1px dashed rgba($stitch-brand-green, .28); border-radius: 18px; }
```

- [ ] **Step 4: Run tests and type checking**

Run: `pnpm --filter @nordic-nutri-ai/mini-program test:unit && pnpm --filter @nordic-nutri-ai/mini-program typecheck`

Expected: PASS.

### Task 4: Build and visually validate the Mini Program output

**Files:**
- Generated: `mini-program/dist/weapp/**`

- [ ] **Step 1: Build the WeChat target**

Run: `pnpm --filter @nordic-nutri-ai/mini-program build:weapp`

Expected: `Compiled successfully`.

- [ ] **Step 2: Verify generated WXSS**

Run: `pnpm --filter @nordic-nutri-ai/mini-program verify:weapp`

Expected: `WXSS compatibility check passed`.

- [ ] **Step 3: Recompile the `mini-program/dist/weapp` project in WeChat Developer Tools**

Expected: safe header and tab bar, target card, insight, actions, and meal list match the fourth reference without clipping or horizontal scrolling.
