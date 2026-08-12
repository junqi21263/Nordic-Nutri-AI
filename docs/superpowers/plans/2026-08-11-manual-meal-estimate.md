# 手动记录时间与营养估算 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持可编辑记录时间与按餐食名称自动估算营养，同时保留用户手动输入。

**Architecture:** 手动记录页维护日期、时间和四项“手动覆盖”状态；复用现有 meal-analysis API 以 100g 生成估算。保存时把日期时间组合为现有的 recordedAt 格式，云函数继续持久化原始识别克数。

**Tech Stack:** Taro React、Zustand、Vitest、CloudBase HTTP function、Node test。

---

### Task 1: 手动记录数据与估算状态

**Files:**
- Modify: `mini-program/src/pages/manual-meal/index.tsx`
- Test: `mini-program/tests/manual-meal-food-detail-image.test.ts`

- [ ] 写一个失败测试，断言页面使用 `Picker` 保存日期/时间，并调用 `analyzeProductMeal`。
- [ ] 实现日期、时间、600ms 去抖估算及营养字段手动覆盖状态。
- [ ] 运行对应 Vitest 测试并确认通过。

### Task 2: 自动估算结果与保存

**Files:**
- Modify: `mini-program/src/pages/manual-meal/index.tsx`
- Test: `mini-program/tests/manual-meal-food-detail-image.test.ts`

- [ ] 写失败测试，断言自动估算结果填充四项营养且保存使用选择的日期时间。
- [ ] 实现估算结果映射、重新估算与 selected food 互斥覆盖规则。
- [ ] 运行对应 Vitest 测试并确认通过。

### Task 3: 云函数份量基准与验证

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/meal-data-service.cjs`
- Test: `cloudbase/functions/get-login-ticket/meal-data-service.test.mjs`

- [ ] 运行原始识别克数持久化测试。
- [ ] 保留 `aiQuantityG`，让调整后确认克数与原始克数分别写入。
- [ ] 运行 Node 测试、lint、typecheck 和 weapp build。

### Task 4: 部署

**Files:**
- Update: CloudBase `get-login-ticket` function code only

- [ ] 读取函数详情确认其为既有 HTTP 函数、运行时和网关权限不变。
- [ ] 部署代码并读取函数详情确认版本更新。
- [ ] 在微信开发者工具重新编译 `mini-program/dist/weapp`。
