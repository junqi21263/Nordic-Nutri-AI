# 保存本餐成功真实流程 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 手动与拍照新建餐食在远端保存和本地同步成功后显示中文庆祝弹窗，并提供查看本餐与继续记录两个真实导航动作。

**Architecture:** 新增短生命周期 Zustand 状态保存最近一次创建结果。创建页面只在远端保存和 meal-store 同步完成后写入该状态；PageLayout 统一渲染现有 Canvas 弹窗并处理导航。编辑已有餐食不触发庆祝，开发预览页会删除。

**Tech Stack:** Taro React、Zustand、Vitest、微信小程序 Canvas。

---

### Task 1: 保存庆祝状态和真实数据转换

**Files:**
- Create: mini-program/src/stores/meal-saved-celebration-store.ts
- Create: mini-program/src/features/meals/meal-saved-celebration-data.ts
- Create: mini-program/tests/meal-saved-celebration-store.test.ts
- Create: mini-program/tests/meal-saved-celebration-data.test.ts

- [ ] **Step 1: Write failing tests**

测试状态在 show 后保留 mealId、保存前热量、保存后热量和目标热量，dismiss 后清空。测试数据转换从已持久化 Meal 的营养合计和同步后的当日 Meal 数组得到弹窗参数；给定保存前 970、保存餐 450、同步当天总计 1420、目标 2100 时，结果必须为 previousCalories 970、currentCalories 1420。

- [ ] **Step 2: Verify the tests fail**

Run: pnpm -C mini-program exec vitest run tests/meal-saved-celebration-store.test.ts tests/meal-saved-celebration-data.test.ts

Expected: FAIL because neither module exists.

- [ ] **Step 3: Implement minimal modules**

实现 SavedMealCelebration 类型：mealId、calories、protein、carbs、fat、previousCalories、currentCalories、targetCalories。状态只提供 savedMeal、show、dismiss。纯数据函数接收 savedMeal、beforeCalories、syncedMeals、targetCalories；从 savedMeal 和同步数组推导数据，不读取未保存的表单字段。

- [ ] **Step 4: Verify tests pass**

Run: pnpm -C mini-program exec vitest run tests/meal-saved-celebration-store.test.ts tests/meal-saved-celebration-data.test.ts

Expected: PASS.

### Task 2: 在 PageLayout 统一展示中文庆祝弹窗

**Files:**
- Modify: mini-program/src/components/meal-saved-celebration/index.tsx
- Modify: mini-program/src/layouts/page-layout/index.tsx
- Modify: mini-program/tests/meal-saved-celebration.test.ts

- [ ] **Step 1: Write failing contract assertions**

断言 PageLayout 使用 useMealSavedCelebrationStore 和 MealSavedCelebration；组件含有“本餐已保存！”、“查看本餐”、“继续记录”。断言查看动作清除状态后按 saved meal ID 打开 meal-detail，继续动作清除状态后 switchTab 到首页。

- [ ] **Step 2: Verify test fails**

Run: pnpm -C mini-program exec vitest run tests/meal-saved-celebration.test.ts

Expected: FAIL because布局层尚未读取保存庆祝状态，组件仍是英文文案。

- [ ] **Step 3: Implement shared modal ownership**

PageLayout 在 pageVisible 时读取全局保存状态并渲染弹窗。查看本餐先 dismiss 再 navigateTo 该餐详情；继续记录先 dismiss 再 switchTab 首页。保留现有 2.2 秒动作锁、Canvas 时间表和视觉参数，只替换面向用户的中文文案。

- [ ] **Step 4: Verify test passes**

Run: pnpm -C mini-program exec vitest run tests/meal-saved-celebration.test.ts

Expected: PASS.

### Task 3: 接入手动记录与拍照直存

**Files:**
- Modify: mini-program/src/pages/manual-meal/index.tsx
- Modify: mini-program/src/pages/analysis-result/index.tsx
- Modify: mini-program/tests/p0-p1-interaction-completion.test.ts

- [ ] **Step 1: Write failing flow assertions**

断言两个页面均在 createProductMeal 前读取 meals.getDailySummary(date).calories，在 getProductMeals 成功后调用 replaceRemoteMeals，并随后调用保存庆祝 store 的 show。断言不再保存成功后直接跳餐食详情。

- [ ] **Step 2: Verify test fails**

Run: pnpm -C mini-program exec vitest run tests/p0-p1-interaction-completion.test.ts

Expected: FAIL because两个页面会立即导航而未设置庆祝状态。

- [ ] **Step 3: Implement after-sync trigger**

在创建请求前捕获当前当天热量。createProductMeal 成功后等待 getProductMeals，先 replaceRemoteMeals，再基于同步数组写入庆祝状态。成就刷新继续为非阻塞；任何保存或同步异常均走原错误反馈且绝不显示弹窗。

- [ ] **Step 4: Verify test passes**

Run: pnpm -C mini-program exec vitest run tests/p0-p1-interaction-completion.test.ts

Expected: PASS.

### Task 4: 接入拍照后的份量调整新建保存

**Files:**
- Modify: mini-program/src/pages/portion-adjustment/index.tsx
- Modify: mini-program/tests/portion-adjustment-interactions.test.ts

- [ ] **Step 1: Write failing branch test**

断言新建分支记录保存前热量、同步远端数组后调用庆祝 store；编辑分支保留现有详情导航且不调用庆祝 store。

- [ ] **Step 2: Verify test fails**

Run: pnpm -C mini-program exec vitest run tests/portion-adjustment-interactions.test.ts

Expected: FAIL because现有实现不区分庆祝与编辑路径。

- [ ] **Step 3: Implement new-meal-only trigger**

只在 editingMealId 为空时创建庆祝参数；同步完成后写入 store 并重置份量草稿。已有餐食更新保留成功提示和详情跳转，不显示保存本餐庆祝。

- [ ] **Step 4: Verify test passes**

Run: pnpm -C mini-program exec vitest run tests/portion-adjustment-interactions.test.ts

Expected: PASS.

### Task 5: 删除开发预览

**Files:**
- Delete: mini-program/src/pages/meal-saved-preview/index.tsx
- Delete: mini-program/src/pages/meal-saved-preview/index.config.ts
- Modify: mini-program/src/app.config.ts
- Modify: mini-program/src/styles/page.scss
- Modify: mini-program/tests/meal-saved-celebration.test.ts

- [ ] **Step 1: Write failing cleanup assertions**

断言预览文件不存在、app.config.ts 不含 meal-saved-preview、样式不含 meal-saved-preview-page、庆祝组件不含面向用户的英文标题或按钮。

- [ ] **Step 2: Verify test fails**

Run: pnpm -C mini-program exec vitest run tests/meal-saved-celebration.test.ts

Expected: FAIL because预览入口仍存在。

- [ ] **Step 3: Remove preview-only surface**

删除两个预览页文件，移除 app.config.ts 的开发条件路由和 page.scss 中预览样式，保留真实流程组件和它的测试。

- [ ] **Step 4: Verify test passes**

Run: pnpm -C mini-program exec vitest run tests/meal-saved-celebration.test.ts

Expected: PASS.

### Task 6: 完整验证

**Files:**
- Verify: mini-program/src

- [ ] **Step 1: Run all focused behavior tests**

Run: pnpm -C mini-program exec vitest run tests/meal-saved-celebration-store.test.ts tests/meal-saved-celebration-data.test.ts tests/meal-saved-celebration.test.ts tests/p0-p1-interaction-completion.test.ts tests/portion-adjustment-interactions.test.ts

Expected: all PASS.

- [ ] **Step 2: Run build gates**

Run: pnpm -C mini-program run typecheck; pnpm -C mini-program run verify:weapp; pnpm -C mini-program run build:weapp; git diff --check

Expected: TypeScript、WXSS、WeApp build 与格式检查均 PASS。

- [ ] **Step 3: Verify in WeChat Developer Tools**

分别保存一条手动记录、一条拍照直存和一条拍照后份量调整新建记录；三个路径均须出现中文弹窗，查看本餐打开对应详情，继续记录回首页，首页和记录页显示同步后的数据。再编辑一条已有餐食，确认不出现新建庆祝弹窗。
