# Nordic Nutri AI UI Foundation Implementation Plan

> **For agentic workers:** Execute inline; do not add any networking, authentication, AI, upload or database behavior.

**Goal:** 将 Stitch 的北欧健康视觉系统落实为 Taro React Design System、真实页面布局与可复用 UI 组件。

**Architecture:** 所有视觉值从 SCSS token 消费；组件只接收展示 Props 与 fixture。页面使用统一的安全区、顶栏、内容区、卡片网格和底部导航，不接入任何后端调用。

**Tech Stack:** Taro React、TypeScript、Sass、现有 Taro 构建链。

---

### Task 1: Token、基础布局与视觉回归约束

**Files:** `mini-program/src/styles/*`、`src/layouts/*`、`scripts/verify-ui-foundation.mjs`。

- [x] 写入失败的静态检查：要求完整色彩/字号/圆角/阴影/间距/动效 token，且组件样式不含十六进制颜色。
- [x] 实现 Light/Dark token 映射、安全区、滚动内容、卡片网格、顶部导航与底部导航布局。
- [x] 运行静态检查、类型检查和 lint。

### Task 2: 原子组件与复合营养组件

**Files:** `mini-program/src/components/*`、`src/types/ui.ts`、`src/styles/components.scss`。

- [x] 扩展静态检查，要求 27 个组件及其交互/状态 Props。
- [x] 实现按钮、卡片、进度、标签、列表、统计、行动卡、搜索、反馈层与加载状态组件。
- [x] 用 Token 统一 hover/active/disabled/loading 与暗色预留样式。

### Task 3: Stitch 风格页面布局

**Files:** `mini-program/src/pages/*`、`src/utils/fixtures.ts`。

- [x] 扩展检查，要求十个页面使用真实布局、Header、Navigation 与至少一个复合组件。
- [x] 使用 fixture 重新构建 Onboarding、Body Profile、Nutrition Plan、Home、Food Scanner、Analysis Result、Meal Detail、Meal Records、Coach 和 Profile。
- [x] 保持 Portion Adjustment 路由兼容，但不将其计入本次正式页面集。

### Task 4: 视觉验证与文档

**Files:** `mini-program/README.md`、`docs/superpowers/plans/2026-07-13-ui-foundation.md`。

- [x] 构建 H5 和 WeApp，检查产物；H5 预览因既有依赖压缩产物语法错误未能截图。
- [x] 运行 TypeScript、ESLint、Prettier、UI 静态检查与既有初始化/Auth 静态检查。
- [x] 未改动 `supabase/`；停止在 UI Foundation 阶段。
