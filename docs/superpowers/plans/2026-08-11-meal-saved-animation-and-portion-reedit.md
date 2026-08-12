# 保存庆祝动画与再次编辑实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让保存庆祝弹窗复刻 Stitch 的连续扫圈时序、整体下移，并让再次编辑回填上次保存的份量比例。

**Architecture:** 庆祝图标继续使用非原生组件的 CSS 双半圆遮罩，避免 Canvas 的布局副作用。餐食项携带后端已有的 `aiQuantityG`，份量草稿以确认份量与原始份量的比例初始化；无法安全推导时使用 100%。

**Tech Stack:** Taro React、Zustand、TypeScript、WXSS、Vitest。

---

### Task 1: 连续扫圈与弹窗垂直位置

**Files:**
- Modify: `mini-program/src/components/meal-saved-celebration/index.tsx`
- Modify: `mini-program/src/styles/page.scss`
- Modify: `mini-program/tests/meal-saved-celebration.test.ts`

- [ ] **Step 1: 写入失败测试**

在庆祝组件测试中断言圆环由两侧遮罩和两侧填充层组成，并断言样式包含 `meal-saved-ring-sweep` 和 `translateY(32rpx)`：

```ts
expect(component).toContain("meal-saved-celebration__ring-mask--left");
expect(component).toContain("meal-saved-celebration__ring-mask--right");
expect(styles).toContain("meal-saved-ring-sweep");
expect(styles).toContain("transform: translateY(32rpx)");
```

- [ ] **Step 2: 运行失败测试**

Run: `pnpm -C mini-program exec vitest run tests/meal-saved-celebration.test.ts`

Expected: FAIL，因为现有四段圆环没有遮罩层。

- [ ] **Step 3: 实现普通视图扫圈**

替换四个 `ring-segment` 为浅色底轨道、左右圆环遮罩和两侧绿色填充层。左、右填充层使用同一 `meal-saved-ring-sweep` 的 600ms 延迟旋转，勾选在圆环完成后显示。给卡片添加 `translateY(32rpx)`，但保留现有缩放入场。

- [ ] **Step 4: 验证动画组件**

Run: `pnpm -C mini-program exec vitest run tests/meal-saved-celebration.test.ts`

Expected: PASS。

### Task 2: 继续编辑回填份量比例

**Files:**
- Modify: `mini-program/src/features/meals/domain.ts`
- Modify: `mini-program/src/features/meals/product-meal-mapper.ts`
- Modify: `mini-program/src/stores/portion-draft-store.ts`
- Create: `mini-program/tests/portion-draft-store.test.ts`

- [ ] **Step 1: 写入失败测试**

创建草稿仓测试，使用原始 100g、确认 75g 的餐食进入编辑，期望草稿比例为 0.75；缺少 `aiQuantityG` 时，期望为 1：

```ts
store.getState().startMealEdit(mealWithOriginalQuantity);
expect(store.getState().multiplier).toBe(0.75);
store.getState().startMealEdit(manualMealWithoutOriginalQuantity);
expect(store.getState().multiplier).toBe(1);
```

- [ ] **Step 2: 运行失败测试**

Run: `pnpm -C mini-program exec vitest run tests/portion-draft-store.test.ts`

Expected: FAIL，因为 `startMealEdit` 目前始终写入 1。

- [ ] **Step 3: 保留并推导原始份量比例**

给 `MealItem` 增加可选 `aiQuantityG`，在 `mapProductItem` 中映射接口返回值。新增一个仅接受所有有效项比例一致时返回比例的辅助函数；比例取 `confirmedQuantityG / aiQuantityG`、约束在 25% 到 200%、按 25% 步进归一。`startMealEdit` 使用该函数，手动或旧数据回退 1。

- [ ] **Step 4: 验证份量草稿**

Run: `pnpm -C mini-program exec vitest run tests/portion-draft-store.test.ts`

Expected: PASS。

### Task 3: 全量验证与构建

**Files:**
- Verify only: `mini-program/src/**`

- [ ] **Step 1: 运行关联测试**

Run: `pnpm -C mini-program exec vitest run tests/meal-saved-celebration.test.ts tests/portion-draft-store.test.ts`

Expected: PASS。

- [ ] **Step 2: 检查小程序编译兼容性**

Run: `pnpm -C mini-program run typecheck && pnpm -C mini-program run verify:weapp`

Expected: TypeScript 与 WXSS 检查均通过。

- [ ] **Step 3: 构建开发者工具产物**

Run: `pnpm -C mini-program run build:weapp`

Expected: `mini-program/dist/weapp/` 构建成功。
