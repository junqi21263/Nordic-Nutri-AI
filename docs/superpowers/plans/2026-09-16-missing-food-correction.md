# 识别纠错补录与多食材约束 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在分析结果页内完成遗漏食物补录，阻止删除唯一食物，并增强多食物照片的识别拆分约束。

**Architecture:** 扩展现有识别反馈 Bottom Sheet 和分析结果页状态，不新建页面；营养估算复用现有 `analyzeProductMeal` 接口。视觉链路只修改 provider 提示词及测试，不改变上传、状态和保存控制流。

**Tech Stack:** Taro 4、React 18、Zustand、SCSS、CloudBase Node.js function、Vitest、Node test runner。

---

### Task 1: 锁定补录和唯一食物删除行为

**Files:**
- Modify: `mini-program/tests/recognition-feedback.test.ts`
- Modify: `mini-program/src/components/recognition-feedback-sheet/index.tsx`
- Modify: `mini-program/src/pages/analysis-result/index.tsx`

- [ ] 写失败测试，断言 missing 模式不再导航食材库，并断言单项删除被禁用。
- [ ] 运行 `pnpm --dir mini-program exec vitest run tests/recognition-feedback.test.ts`，确认新断言先失败。
- [ ] 为 Bottom Sheet 增加名称、克重、快捷克重、加载和匹配失败状态；提交由分析结果页处理。
- [ ] 使用 `analyzeProductMeal([{ name, quantityG }])` 获取营养项，转换成当前 `MealItem` 后追加并同步纠正快照。
- [ ] 对删除入口增加 `items.length <= 1` 防护和说明。
- [ ] 再次运行 focused test，确认通过。

### Task 2: 复刻 Stitch 补录样式

**Files:**
- Modify: `mini-program/src/styles/page.scss`

- [ ] 按 Stitch 落地 24–28px 顶部圆角、正常移动端字号、44px 输入和按钮、50/100/150g 快捷项及安全区间距。
- [ ] 不加入 Stitch 的状态演示工具条，不引入字体或 UI 依赖。
- [ ] 运行 `pnpm run typecheck:mini-program` 和 `git diff --check`。

### Task 3: 增强多食物视觉识别约束

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/qwen-vision-service.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/qwen-vision-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/vita-vision-service.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/vita-vision-service.cjs`

- [ ] 增加提示词契约测试：明显多区域餐食应输出多个项目，组合菜不强拆隐藏原料，不得虚构食材。
- [ ] 运行两组视觉 provider 测试并确认新断言先失败。
- [ ] 仅修改 provider 系统提示词，使两个 provider 采用相同的多食材判断原则。
- [ ] 重跑视觉 provider 测试和现有视觉路由 focused tests。

### Task 4: 综合验证

**Files:**
- Verify only

- [ ] 运行识别反馈、视觉 provider、视觉数据服务 focused tests。
- [ ] 运行 `pnpm run typecheck:mini-program`。
- [ ] 运行 Android H5 构建、Capacitor copy 和 `./gradlew assembleDebug`。
- [ ] 若设备在线，安装 APK；真机视觉和完整识别结果仍作为独立验收项报告。
