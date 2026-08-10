# 扫描结果固定底栏入场动画 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 使扫描结果固定底栏在所有前序内容展示完毕后，从屏幕底部整体滑入并保持固定。

**Architecture:** 继续复用既有 `bottomActionReveal` phase，不新增组件或状态。将固定栏的初始位移由轻微 24px 改为完全离屏的 100%，将其过渡扩展为 420ms，并将总完成时间延后到过渡结束之后。

**Tech Stack:** Taro 4、React 18、TypeScript、Sass、Vitest。

---

## 文件结构

- 修改：`mini-program/src/features/scanner/meal-recognition-motion.ts` — 固定栏 reveal 的时长与总完成时间。
- 修改：`mini-program/src/styles/page.scss` — 固定栏初始离屏位移与入场过渡。
- 修改：`mini-program/tests/meal-recognition-motion.test.ts` — 锁定时间线与离屏入场样式契约。

### Task 1: 为完整离屏入场添加失败测试

**Files:**
- Modify: `mini-program/tests/meal-recognition-motion.test.ts`

- [ ] **Step 1: 写入失败测试**

在 `keeps the approved timing in one schedule` 中替换底部断言：

```ts
    expect(mealRecognitionMotionConfig.bottomActionRevealAtMs).toBe(2200);
    expect(mealRecognitionMotionConfig.bottomActionDurationMs).toBe(420);
    expect(mealRecognitionMotionConfig.completeAtMs).toBe(2700);
```

并在固定栏契约测试末尾添加：

```ts
    expect(styles).toContain("transform: translateY(100%)");
    expect(styles).toContain("opacity 420ms cubic-bezier(.22, 1, .36, 1)");
```

- [ ] **Step 2: 运行测试，确认失败原因是旧时间与位移**

Run: `pnpm --dir mini-program test:unit -- meal-recognition-motion.test.ts`

Expected: FAIL，显示 `bottomActionDurationMs` 仍为 340、`completeAtMs` 仍为 2600，且样式中不存在 `translateY(100%)`。

### Task 2: 实现最后阶段的完整 bottom slide-up

**Files:**
- Modify: `mini-program/src/features/scanner/meal-recognition-motion.ts:12-14`
- Modify: `mini-program/src/styles/page.scss:6360-6367`

- [ ] **Step 1: 延长底栏动画并保持先后顺序**

把配置改为：

```ts
  bottomActionRevealAtMs: 2200,
  bottomActionDurationMs: 420,
  completeAtMs: 2700,
```

保留 `bottomActionRevealAtMs`，使入场仍在内容 reveal 之后启动；`completeAtMs` 晚于 `2200 + 420`，避免父级动画属性提前消失。

- [ ] **Step 2: 令固定栏在触发前完全离屏**

在 `[data-motion-layer="bottom"]` 规则中使用：

```scss
  opacity: 0;
  transform: translateY(100%);
  transition: opacity 420ms cubic-bezier(.22, 1, .36, 1), transform 420ms cubic-bezier(.22, 1, .36, 1);
```

保留现有 `[data-bottom-revealed="true"]` 规则的 `opacity: 1` 和 `transform: translateY(0)`，以及减少动态效果时直接可见的规则。

- [ ] **Step 3: 运行聚焦测试，确认转绿**

Run: `pnpm --dir mini-program test:unit -- meal-recognition-motion.test.ts`

Expected: PASS。

### Task 3: 回归与构建验证

**Files:**
- Modify: 无

- [ ] **Step 1: 运行全量检查**

Run:

```bash
pnpm --dir mini-program test:unit
pnpm --dir mini-program typecheck
pnpm --dir mini-program lint
pnpm --dir mini-program build:weapp
pnpm --dir mini-program verify:weapp
```

Expected: 所有命令退出码 0。

- [ ] **Step 2: 手动验证播放顺序**

在微信开发者工具中通过一次真实扫描进入结果页：

1. 确认固定底栏在前 2200ms 完全不可见。
2. 确认识别食材与 NOVA 洞察完成 reveal 后，固定栏从页面底部整体滑入。
3. 确认滑入结束后，滚动时固定栏仍在屏幕底部，两个按钮可点击。

- [ ] **Step 3: 提交实现**

```bash
git add mini-program/src/features/scanner/meal-recognition-motion.ts \
  mini-program/src/styles/page.scss \
  mini-program/tests/meal-recognition-motion.test.ts \
  docs/superpowers/plans/2026-08-10-analysis-result-bottom-bar-reveal.md
git commit -m "fix: animate scan result action bar"
```

不暂存用户已有的 `docs/superpowers/plans/2026-08-09-coach-meal-context.md`。
