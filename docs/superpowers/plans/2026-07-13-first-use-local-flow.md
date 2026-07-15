# Nordic Nutri AI First-use Local Flow Implementation Plan

> **For agentic workers:** Execute inline with test-first steps. Do not add remote access, login, storage upload, AI, Supabase, or database behavior.

**Goal:** 在微信小程序中提供可本地试用的目标选择、身体资料与确定性营养计划首次使用链路。

**Architecture:** 将目标、资料校验与营养计算置于纯 TypeScript domain 模块；Zustand store 仅保存短期、非敏感草稿到小程序本地存储。三个页面只读取和更新该草稿，并使用 Taro 路由切换。

**Tech Stack:** Taro React、TypeScript、Zustand、Vitest、Sass。

---

### Task 1: 微信端验收与兼容边界

- [x] 审查 `project.config.json`、`app.config.ts`、页面布局和 WXSS 特性。
- [x] 增加微信视觉验收 checklist；仅修复安全区、滚动和键盘相关兼容项。

### Task 2: 领域模型与单元测试

- [x] 先创建 `mini-program/tests/onboarding-domain.test.ts`，覆盖目标选择、资料边界、计划差异、宏量热量误差与 reset；确认因模块尚不存在而失败。
- [x] 创建 `src/features/onboarding/domain.ts`，实现 `validateGoal`、`validateBodyProfile`、`calculateNutritionPlan`。
- [x] 创建可注入存储的 onboarding Zustand factory，并以 Taro storage adapter 提供实际 store。
- [x] 运行测试并确认通过。

### Task 3: 三页本地交互

- [x] Onboarding：单选目标、禁用继续、保存选择并导航。
- [x] Body Profile：字段输入、附近错误、数字键盘、日期选择、草稿保留与导航。
- [x] Nutrition Plan：显示本地计算结果、返回调整、进入 Home fixture。

### Task 4: 全量验证

- [x] 执行 UI/static、TypeScript、ESLint、Prettier、unit test、微信构建。
- [x] 确认不含网络请求且 `supabase/` 未被改动。
