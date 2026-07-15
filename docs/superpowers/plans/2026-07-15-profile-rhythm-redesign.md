# Profile Rhythm Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `subagent-driven-development` (recommended) or `executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the Profile tab as a Chinese “我的节奏” view that surfaces identity, goal progress, daily rhythm, achievements, and settings while retaining the existing Nordic visual system and local fixture stores.

**Architecture:** Keep data derivation in `pages/profile/index.tsx`: profile values come from `useProfileStore`, meal count and protein progress come from `useMealStore`, and achievements continue to come from the existing achievement store/factory. Apply only `.profile-rhythm*` scoped SCSS so other routes retain their current styles.

**Tech Stack:** Taro 4, React, TypeScript, Zustand fixture stores, SCSS tokens, Vitest.

---

### Task 1: Add a failing Profile hierarchy contract

**Files:**
- Modify: `mini-program/tests/coach-profile.test.ts`

- [ ] **Step 1: Require the Chinese rhythm hierarchy and hide developer-only controls by default**

```ts
expect(source).toContain('title="我的节奏"');
expect(source).toContain('className="profile-rhythm__goal-progress"');
expect(source).toContain("当前体重");
expect(source).toContain("蛋白完成度");
expect(source).toContain("本周回顾");
expect(source).not.toContain('title="Theme"');
expect(source).not.toContain('title="Language"');
```

- [ ] **Step 2: Run the focused test and confirm it fails against the current mixed-language profile**

Run: `pnpm --dir mini-program exec vitest run tests/coach-profile.test.ts`

Expected: failure because the existing page has no goal progress card or weekly review and still renders English preference labels.

### Task 2: Recompose Profile around the user’s goal rhythm

**Files:**
- Modify: `mini-program/src/pages/profile/index.tsx`

- [ ] **Step 1: Derive safe local progress values**

```ts
const proteinCompletion = summary.protein
  ? Math.min(100, Math.round((summary.consumed.protein / summary.protein) * 100))
  : 0;
const weightRemaining = Math.max(0, profile.profile.targetWeight - profile.profile.weight);
```

- [ ] **Step 2: Keep the dark identity card, then add a goal-progress card**

```tsx
<View className="profile-rhythm__goal-progress">
  <View className="profile-rhythm__goal-progress-head">
    <Text>当前体重</Text>
    <Text>目标体重</Text>
  </View>
  <View className="profile-rhythm__goal-progress-values">
    <Text>{profile.profile.weight} kg</Text>
    <Text>{profile.profile.targetWeight} kg</Text>
  </View>
  <View className="profile-rhythm__goal-progress-track"><View /></View>
  <Text>距离目标还差 {weightRemaining} kg · 稳定前进中</Text>
</View>
```

- [ ] **Step 3: Replace the mixed-language statistics with four Chinese local-data indicators**

```tsx
<StatisticCard label="目标热量" value={`${profile.profile.targetCalories}`} hint="kcal" />
<StatisticCard label="蛋白完成度" value={`${proteinCompletion}%`} hint="今日" tone="sage" />
<StatisticCard label="已记录餐次" value={`${meals.meals.length}`} hint="本地记录" tone="beige" />
<StatisticCard label="本周坚持" value="4 天" hint="保持节奏" />
```

- [ ] **Step 4: Add a compact weekly review and Chinese settings groups**

```tsx
<View className="profile-rhythm__weekly-review">
  <Text>本周回顾</Text>
  <Text>营养节奏 {Math.max(0, proteinCompletion)} 分</Text>
  <Text>查看本周总结 ›</Text>
</View>
```

Use the existing feedback store for the review and list-row clicks; preserve export/reset actions but keep reset and developer controls inside `developerMode` only.

### Task 3: Style the Profile page as a Nordic progress map

**Files:**
- Modify: `mini-program/src/styles/page.scss`

- [ ] **Step 1: Add scoped hierarchy styles only**

```scss
.profile-rhythm { display: flex; flex-direction: column; gap: $space-20; }
.profile-rhythm__goal-progress { background: $color-soft-beige; border-radius: $radius-16; padding: $space-16; }
.profile-rhythm__goal-progress-track { background: rgba($color-forest-green, .14); border-radius: $radius-full; height: 8px; overflow: hidden; }
.profile-rhythm__goal-progress-track > View { background: $color-forest-green; border-radius: inherit; height: 100%; width: 42%; }
```

- [ ] **Step 2: Make achievements horizontally legible and keep settings visually separate**

```scss
.profile-rhythm__achievement-row { display: flex; gap: $space-8; overflow: hidden; }
.profile-rhythm__settings-group { background: $color-surface; border: 1px solid rgba($color-divider, .72); border-radius: $radius-16; overflow: hidden; }
```

- [ ] **Step 3: Remove Profile’s emoji action and mixed-language presentation without changing shared tokens, routing, stores, or tab bar code.**

### Task 4: Verify the Profile redesign and WeChat build

**Files:**
- Test: `mini-program/tests/coach-profile.test.ts`

- [ ] **Step 1: Run the focused contract test**

Run: `pnpm --dir mini-program exec vitest run tests/coach-profile.test.ts`

Expected: all Profile/Coach tests pass.

- [ ] **Step 2: Run static validation**

Run: `pnpm --dir mini-program run typecheck && pnpm --dir mini-program run lint`

Expected: both commands succeed with no new diagnostics.

- [ ] **Step 3: Build and validate the WeChat import target**

Run: `pnpm --dir mini-program run build:weapp && pnpm --dir mini-program run verify:weapp`

Expected: Taro compilation succeeds and WXSS compatibility reports `passed`.
