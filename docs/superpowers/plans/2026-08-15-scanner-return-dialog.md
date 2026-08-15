# 扫描保存后返回与退出弹窗修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让扫描保存后查看餐食详情的返回动作进入饮食记录，并让扫描分析页退出确认弹窗居中、固定、锁定页面滚动且按钮文案不换行。

**Architecture:** 使用详情 URL 的显式 `from=analysis` 参数表达扫描来源，不引入全局导航状态。餐食详情仅对该来源切换到记录 Tab，其他来源保留 `navigateBack`。弹窗继续复用现有 `ConfirmDialog`，只在分析结果页通过 `PageLayout.scrollLocked` 和页面作用域 SCSS 调整布局。

**Tech Stack:** Taro 4、React、TypeScript、SCSS、Vitest、pnpm。

---

### Task 1: 添加返回来源与弹窗行为的失败契约测试

**Files:**
- Modify: `mini-program/tests/meal-detail-interactions.test.ts`
- Modify: `mini-program/tests/meal-recognition-motion.test.ts`

- [ ] **Step 1: 为扫描来源详情返回写失败测试**

在 `餐食详情交互` describe 中新增测试，读取 `layouts/page-layout/index.tsx` 与 `pages/meal-detail/index.tsx`，断言：

```ts
it("让扫描保存后的餐食详情返回饮食记录，而手动记录继续返回原页面", () => {
  const layout = readFileSync(
    resolve(sourceRoot, "layouts/page-layout/index.tsx"),
    "utf8",
  );
  const detail = read("pages/meal-detail/index.tsx");

  expect(layout).toContain('currentPage?.route === "pages/analysis-result/index"');
  expect(layout).toContain("from=analysis");
  expect(detail).toContain('router.params.from === "analysis"');
  expect(detail).toContain('Taro.switchTab({ url: "/pages/meal-records/index" })');
  expect(detail).toContain("Taro.navigateBack()");
});
```

- [ ] **Step 2: 为弹窗居中、锁滚动、按钮单行写失败测试**

在 `meal recognition result reveal motion` describe 中新增测试，读取分析页、布局样式和页面样式：

```ts
it("keeps the analysis exit dialog centered, fixed and single-line", () => {
  const page = read("pages/analysis-result/index.tsx");
  const layout = read("styles/layout.scss");
  const styles = read("styles/page.scss");

  expect(page).toContain("scrollLocked={exitConfirmOpen}");
  expect(styles).toContain(".page-layout--analysis-result .modal-backdrop");
  expect(styles).toContain("align-items: center;");
  expect(styles).toContain("touch-action: none;");
  expect(styles).toContain(".page-layout--analysis-result .confirm-dialog__actions .app-button");
  expect(styles).toContain("white-space: nowrap;");
  expect(layout).toContain("page-layout--scroll-locked .page-layout__scroll");
  expect(layout).toContain("overflow: hidden;");
});
```

- [ ] **Step 3: 运行定向测试并确认按预期失败**

Run:

```bash
pnpm --dir mini-program exec vitest run tests/meal-detail-interactions.test.ts tests/meal-recognition-motion.test.ts
```

Expected: FAIL，因为当前 PageLayout 没有扫描来源参数、详情页没有来源分支、分析页未传 `scrollLocked`，且页面样式没有上述作用域规则。

### Task 2: 实现扫描保存后的详情返回分支

**Files:**
- Modify: `mini-program/src/layouts/page-layout/index.tsx:204-209`
- Modify: `mini-program/src/pages/meal-detail/index.tsx:55-60,143-149`

- [ ] **Step 1: 在共享“查看本餐”导航中增加扫描来源参数**

在 `onViewMeal` 的当前页面判断之后，保留现有 portion-adjustment 特殊处理；普通详情导航改为：

```ts
const detailSource = currentPage?.route === "pages/analysis-result/index" ? "&from=analysis" : "";
return Taro.navigateTo({ url: `/pages/meal-detail/index?id=${savedMeal.mealId}${detailSource}` });
```

不得改变 `dismissSavedMealCelebration()`、`finishMealSaveSuccessFlow()` 或 portion-adjustment 分支。

- [ ] **Step 2: 让餐食详情只对扫描来源切换到记录页**

复用已有 `router = useRouter()`，增加局部返回处理：

```ts
const handleTopBarBack = () => {
  if (router.params.from === "analysis") {
    void Taro.switchTab({ url: "/pages/meal-records/index" });
    return;
  }
  void Taro.navigateBack();
};
```

将详情页 `onTopBarBack={() => Taro.navigateBack()}` 替换为 `onTopBarBack={handleTopBarBack}`。其他详情入口、删除成功跳转和数据加载不改。

- [ ] **Step 3: 运行返回契约测试确认通过**

Run:

```bash
pnpm --dir mini-program exec vitest run tests/meal-detail-interactions.test.ts
```

Expected: PASS。

### Task 3: 实现分析页退出弹窗的居中与滚动锁定

**Files:**
- Modify: `mini-program/src/pages/analysis-result/index.tsx:431-495`
- Modify: `mini-program/src/styles/page.scss` near the analysis-result page rules

- [ ] **Step 1: 在分析页把弹窗状态传给 PageLayout**

在分析结果页的 `PageLayout` 上增加：

```tsx
scrollLocked={exitConfirmOpen}
```

保持 `onTopBarBack={() => setExitConfirmOpen(true)}` 和 ConfirmDialog 的确认/取消行为不变。

- [ ] **Step 2: 增加页面作用域的固定居中与按钮单行样式**

在 `mini-program/src/styles/page.scss` 增加：

```scss
.page-layout--analysis-result .modal-backdrop {
  align-items: center;
  touch-action: none;
}

.page-layout--analysis-result .confirm-dialog__actions .app-button {
  white-space: nowrap;
}
```

继续使用现有全局 `.modal-backdrop { position: fixed; ... }` 与 `page-layout--scroll-locked .page-layout__scroll { overflow: hidden; }`，不修改其他页面的 modal 或 ConfirmDialog 布局。

- [ ] **Step 3: 运行弹窗契约测试确认通过**

Run:

```bash
pnpm --dir mini-program exec vitest run tests/meal-recognition-motion.test.ts
```

Expected: PASS。

### Task 4: 完整验证并检查差异范围

**Files:**
- Test only: existing mini-program test suite

- [ ] **Step 1: 运行类型检查、lint 和单元测试**

Run:

```bash
pnpm --dir mini-program typecheck
pnpm --dir mini-program lint
pnpm --dir mini-program test:unit
```

Expected: 全部 PASS，现有 512 个单元测试及新增契约测试通过。

- [ ] **Step 2: 重新构建微信小程序并验证产物**

Run:

```bash
pnpm --dir mini-program build:weapp
pnpm --dir mini-program verify:weapp
```

Expected: 构建成功，`mini-program/dist/weapp` 验证通过。

- [ ] **Step 3: 检查 diff 只覆盖本需求**

Run:

```bash
git diff --check
git diff --stat
git status --short
```

Expected: 只出现 PageLayout、meal-detail、analysis-result、page.scss 与两份测试的本需求修改；不修改识别服务、API、Auth、milestone、feedback 或其他页面逻辑。
