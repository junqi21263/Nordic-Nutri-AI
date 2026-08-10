# 扫描结果页固定操作栏 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让扫描结果页的免责声明、调整份量和保存本餐始终固定在屏幕底部，并沿用现有结果 reveal 的底部 slide-up 节奏。

**Architecture:** 在分析结果页以一个 `analysis-result-page__bottom-bar` 容器包裹现有免责声明与操作按钮，使其成为唯一的固定定位和 reveal 承载节点。滚动内容在布局层预留固定栏高度，避免最后一张洞察卡被遮挡；保存和调整份量事件保持原有引用与逻辑不变。

**Tech Stack:** Taro 4、React 18、TypeScript、Sass、Vitest。

---

## 文件结构

- 修改：`mini-program/src/pages/analysis-result/index.tsx` — 将既有底部内容包装为固定栏并保留既有事件。
- 修改：`mini-program/src/styles/page.scss` — 固定栏样式、底部安全区和 reveal 过渡。
- 修改：`mini-program/src/styles/layout.scss` — 分析结果页滚动区的底栏高度预留。
- 修改：`mini-program/tests/meal-recognition-motion.test.ts` — 锁定固定栏、动画承载点与滚动预留这一页面契约。

### Task 1: 固定栏契约测试

**Files:**
- Modify: `mini-program/tests/meal-recognition-motion.test.ts`

- [ ] **Step 1: 写入失败测试，表达固定栏及动画承载点契约**

在现有 `wires motion only to the true scanner-to-result transition` 测试后新增：

```ts
  it("keeps scan-result actions fixed without changing their existing handlers", () => {
    const page = read("pages/analysis-result/index.tsx");
    const styles = read("styles/page.scss");
    const layout = read("styles/layout.scss");

    expect(page).toContain('className="analysis-result-page__bottom-bar"');
    expect(page).toContain('className="nutrition-disclaimer"');
    expect(page).toContain('className="analysis-result-page__actions"');
    expect(page).toContain('data-motion-layer="bottom"');
    expect(styles).toContain(".analysis-result-page__bottom-bar");
    expect(styles).toContain("position: fixed");
    expect(styles).toContain(".analysis-result-page__bottom-bar .analysis-result-page__actions");
    expect(layout).toContain("--analysis-result-bottom-bar-height");
  });
```

- [ ] **Step 2: 运行测试，确认它因缺少固定栏而失败**

Run: `pnpm --dir mini-program test:unit -- meal-recognition-motion.test.ts`

Expected: FAIL，断言找不到 `analysis-result-page__bottom-bar`。

### Task 2: 最小页面与样式实现

**Files:**
- Modify: `mini-program/src/pages/analysis-result/index.tsx:391-418`
- Modify: `mini-program/src/styles/page.scss:6308-6340`
- Modify: `mini-program/src/styles/layout.scss:42-44`

- [ ] **Step 1: 将现有底部节点包入唯一固定栏**

把免责声明及既有 `analysis-result-page__actions` 放入以下容器；按钮文本、`onClick` 回调及 `AppButton` 属性原样保留：

```tsx
        <View className="analysis-result-page__bottom-bar" data-motion-layer="bottom">
          <Text className="nutrition-disclaimer">
            营养识别与建议仅供日常饮食参考，不构成医疗诊断或治疗建议。
          </Text>
          <View className="analysis-result-page__actions">
            {/* 保留当前调整份量与保存本餐两个 AppButton 原样 */}
          </View>
        </View>
```

删除原先分别加在免责声明和操作区上的 `data-motion-layer="bottom"`，确保现有 reveal 规则只对新容器执行一次。

- [ ] **Step 2: 添加固定栏样式且复用既有视觉令牌**

在 `.analysis-result-page__actions` 前添加，并将其原先的 `padding-bottom` 改由父容器承担：

```scss
$analysis-result-bottom-bar-height: 148px;

.analysis-result-page__bottom-bar {
  background: rgba($color-warm-white, 0.98);
  border-top: 1px solid rgba($color-forest-green, 0.12);
  bottom: 0;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: $space-12;
  left: 0;
  padding: $space-12 $page-horizontal calc($space-12 + $safe-area-bottom);
  position: fixed;
  right: 0;
  z-index: 20;
}

.analysis-result-page__bottom-bar .analysis-result-page__actions {
  padding-bottom: 0;
}
```

保留 `.analysis-result-page__actions` 的两列网格、按钮字号与宽度规则；仅删除它自身的 `padding-bottom: calc(...)`。

- [ ] **Step 3: 为滚动内容预留固定栏空间**

在 `mini-program/src/styles/layout.scss` 的分析结果页规则上声明并使用同一高度变量：

```scss
.page-layout--analysis-result {
  --analysis-result-bottom-bar-height: 148px;
}

.page-layout--analysis-result .page-layout__content {
  padding-bottom: calc($safe-area-bottom + var(--analysis-result-bottom-bar-height) + $space-16);
}
```

这使 AI 洞察卡能滚动到固定栏完全上方，同时不会影响其他页面。

- [ ] **Step 4: 运行聚焦测试，确认转绿**

Run: `pnpm --dir mini-program test:unit -- meal-recognition-motion.test.ts`

Expected: PASS，所有该文件的测试通过。

### Task 3: 全量回归与构建验证

**Files:**
- Modify: 无

- [ ] **Step 1: 运行静态与单元验证**

Run:

```bash
pnpm --dir mini-program test:unit
pnpm --dir mini-program typecheck
pnpm --dir mini-program lint
```

Expected: 三项均退出码 0。

- [ ] **Step 2: 构建微信小程序产物并校验 WXSS**

Run:

```bash
pnpm --dir mini-program build:weapp
pnpm --dir mini-program verify:weapp
```

Expected: 产物生成于 `mini-program/dist/weapp`，WXSS 校验通过。

- [ ] **Step 3: 手动验收路径**

在微信开发者工具打开 `mini-program/dist/weapp`：

1. 从扫描页完成一次识别进入结果页。
2. 首屏确认免责声明、调整份量、保存本餐固定显示。
3. 确认到 `bottomActionReveal` 时底栏由下向上淡入，随后位置不随内容滚动。
4. 向下滚动，确认洞察卡能够完整显示在固定栏上方。
5. 点击调整份量与保存本餐，确认保留原有跳转/保存行为。

- [ ] **Step 4: 提交实现**

```bash
git add mini-program/src/pages/analysis-result/index.tsx \
  mini-program/src/styles/page.scss \
  mini-program/src/styles/layout.scss \
  mini-program/tests/meal-recognition-motion.test.ts \
  docs/superpowers/plans/2026-08-10-analysis-result-fixed-action-bar.md
git commit -m "fix: keep scan result actions fixed"
```

不暂存 `docs/superpowers/plans/2026-08-09-coach-meal-context.md`，它是用户已有的未跟踪文件。
