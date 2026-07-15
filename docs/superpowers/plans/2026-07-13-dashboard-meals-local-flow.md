# Nordic Nutri AI Dashboard and Meals Local Flow Implementation Plan

> **For agentic workers:** Execute inline with test-first steps. Do not add any remote request, Supabase access, login, upload, AI, migration, or Edge Function behavior.

**Goal:** 以本地 fixture 和 Zustand 实现 Home Dashboard、Meal Records、Meal Detail 的可用交互链路。

**Architecture:** Meal item 是唯一的营养汇总来源；纯领域函数负责日期、汇总、搜索、筛选和安全进度，Zustand store 负责本地 CRUD 与页面状态。路由只使用 Taro 本地导航，所有视觉继续消费既有 tokens 和组件。

**Tech Stack:** Taro React、TypeScript、Zustand、Vitest、Sass。

---

### Task 1: WeApp compatibility and test contract

- [x] 检查自定义导航、安全区、滚动、底部导航、横向宽度和 WXSS 特性；为圆形进度增加可强制的本地降级组件。
- [x] 写入 meal domain/store 的失败测试，覆盖每日汇总、溢出进度、CRUD 同步、搜索、筛选、日期、空态、reset 和本地无网络请求。

### Task 2: Meal domain, fixture and store

- [x] 建立 `features/meals` 类型、fixture、selector 和进度函数；所有 totals 从 `items` 汇总。
- [x] 建立可注入 fixture 的 Zustand meal store，支持查询、筛选、本地分页、收藏、删除、编辑和 reset。

### Task 3: Components and routing

- [x] 完成 DateSelector、DailyNutritionSummary、MealGroup、ProgressFallback，并让 BottomTabBar 使用去重的本地路由。
- [x] 让 MealCard 支持真实本地详情导航；为低版本 conic-gradient 提供数值与线性进度降级。

### Task 4: Three local pages

- [x] Home 使用 store 汇总、规则型 insight、四餐次和空餐次入口。
- [x] Meal Records 使用日期、搜索防抖、筛选、空态和本地分段加载。
- [x] Meal Detail 支持不存在 ID 错误态、收藏、编辑草稿、本地删除确认与返回记录页。

### Task 5: Verification

- [x] 执行单测、TypeScript、ESLint、Prettier、静态无网络检查与微信小程序构建。
- [x] 确认 `dist/weapp/` 和 `supabase/` 均符合范围限制。
