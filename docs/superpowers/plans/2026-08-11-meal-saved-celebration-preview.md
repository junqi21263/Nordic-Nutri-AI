# Meal Saved Celebration Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个与 Stitch 动态和最终状态一致、但尚不接入保存业务的微信小程序成功庆祝预览。

**Architecture:** `meal-saved-celebration-motion.ts` 仅定义时间与 progress 计算，`useMealSavedCelebrationMotion` 管理可取消的 RAF 与阶段状态，组件用 Taro `View/Text` 和 WXSS 复刻画面。开发态预览页传入演示数据并只能本地重放。

**Tech Stack:** Taro React、TypeScript、SCSS/WXSS、Vitest、CSS keyframes、requestAnimationFrame。

---

### Task 1: 锁定动效合同的失败测试

**Files:**
- Create: `mini-program/tests/meal-saved-celebration.test.ts`
- Create: `mini-program/src/features/meals/meal-saved-celebration-motion.ts`

- [ ] **Step 1: Write the failing test**

```ts
expect(mealSavedCelebrationMotion.totalDurationMs).toBe(2200);
expect(getMealSavedProgress({ beforeCalories: 970, currentCalories: 1420, targetCalories: 2100 })).toEqual({ from: 46.19, to: 67.62 });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir mini-program vitest run tests/meal-saved-celebration.test.ts`
Expected: FAIL because the motion module does not exist.

- [ ] **Step 3: Implement the motion contract**

```ts
export const mealSavedCelebrationMotion = { totalDurationMs: 2200, ringDurationMs: 600, checkDelayMs: 500 } as const;
export function getMealSavedProgress(input: MealSavedProgressInput) { /* clamp values and return two percentages */ }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir mini-program vitest run tests/meal-saved-celebration.test.ts`
Expected: PASS.

### Task 2: 建立独立组件与重播控制器

**Files:**
- Create: `mini-program/src/components/meal-saved-celebration/index.tsx`
- Create: `mini-program/src/hooks/useMealSavedCelebrationMotion.ts`
- Modify: `mini-program/src/styles/page.scss`
- Modify: `mini-program/tests/meal-saved-celebration.test.ts`

- [ ] **Step 1: Add failing component-contract assertions**

```ts
expect(component).toContain("export interface MealSavedCelebrationProps");
expect(component).toContain("requestAnimationFrame");
expect(styles).toContain("meal-saved-celebration__card");
expect(styles).toContain("stroke-dashoffset");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir mini-program vitest run tests/meal-saved-celebration.test.ts`
Expected: FAIL because the component and CSS do not exist.

- [ ] **Step 3: Implement the component**

```tsx
<View className="meal-saved-celebration" data-visible={visible ? "true" : "false"}>
  <View className="meal-saved-celebration__backdrop" />
  <View className="meal-saved-celebration__card">{/* ring, copy, chips, progress, CTAs */}</View>
</View>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --dir mini-program vitest run tests/meal-saved-celebration.test.ts`
Expected: PASS.

### Task 3: 添加仅开发态的预览页

**Files:**
- Create: `mini-program/src/pages/meal-saved-preview/index.tsx`
- Create: `mini-program/src/pages/meal-saved-preview/index.config.ts`
- Modify: `mini-program/src/app.config.ts`
- Modify: `mini-program/tests/meal-saved-celebration.test.ts`

- [ ] **Step 1: Add failing preview-boundary assertions**

```ts
expect(preview).toContain("process.env.NODE_ENV !== \"production\"");
expect(preview).toContain("Replay Animation");
expect(preview).not.toContain("createProductMeal");
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --dir mini-program vitest run tests/meal-saved-celebration.test.ts`
Expected: FAIL because the preview page does not exist.

- [ ] **Step 3: Implement the development-only preview page and route**

```tsx
const [visible, setVisible] = useState(true);
const replay = () => { setVisible(false); setTimeout(() => setVisible(true), 32); };
```

- [ ] **Step 4: Run focused and full verification**

Run: `pnpm --dir mini-program vitest run tests/meal-saved-celebration.test.ts && pnpm --dir mini-program run typecheck && pnpm --dir mini-program run lint && pnpm --dir mini-program run build:weapp && pnpm --dir mini-program run verify:weapp`
Expected: all commands exit 0.
