# NOVA 教练分析进度 Implementation Plan

**Goal:** 在同一条 assistant 流式消息内实现安全的分析摘要、自动折叠和正文流式输出。

**Files:** `mini-program/src/features/coach/analysis-progress.ts` 定义纯状态与分类；`mini-program/src/pages/coach/components/AnalysisProgress/index.tsx` 展示摘要；`mini-program/src/pages/coach/index.tsx` 接入 placeholder 生命周期；`mini-program/src/api/coach-api.ts` 提供取消；对应 Vitest 覆盖分类、首个 chunk、回退、历史消息和组件约束。

**Verification:** 先运行新增测试观察模块不存在的失败，再实现并运行目标测试；最后运行相关教练测试、`typecheck`、`lint`、`build:weapp` 与 `verify:weapp`。不改 CloudBase、营养计算、输入栏或页面总布局。
