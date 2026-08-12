# 每日营养目标确定性计算 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让每日营养目标随身体资料、活动量和目标方向稳定且可复现地重新计算。

**Architecture:** 后端公式返回唯一的数值目标；AI 只生成洞察。小程序公式作为离线兜底，保持与后端同一参数和结果。通过输入矩阵测试两端一致性，并保留完整 `very_high` 活动等级。

**Tech Stack:** Node.js CloudBase HTTP function、TypeScript/Taro、Vitest、node:test。

---

### Task 1: 统一公式与活动等级

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/nutrition-plan-formula.cjs`
- Modify: `mini-program/src/features/onboarding/domain.ts`
- Test: `cloudbase/functions/get-login-ticket/nutrition-plan-formula.test.mjs`
- Test: `mini-program/tests/onboarding-domain.test.ts`

- [x] **Step 1: 写入失败矩阵测试**

测试五个独立输入变化：性别、年龄、身高、体重、活动量和目标方向；并断言 `very_high` 高于 `high`，健康饮食使用 `TDEE × 1.08` 与 `1.8g/kg` 蛋白质。

- [x] **Step 2: 执行测试并确认失败**

Run: `node --test cloudbase/functions/get-login-ticket/nutrition-plan-formula.test.mjs && pnpm --dir mini-program exec vitest run tests/onboarding-domain.test.ts`

Expected: 失败，显示后端健康饮食公式或前端 `very_high` 类型尚未覆盖。

- [x] **Step 3: 对齐两端公式参数**

在前端 `ActivityLevel`、活动系数和后端回退公式中覆盖 `very_high`；将健康饮食目标改为 `TDEE × 1.08`、蛋白质 `1.8g/kg`。

- [x] **Step 4: 再次执行矩阵测试**

Run: `node --test cloudbase/functions/get-login-ticket/nutrition-plan-formula.test.mjs && pnpm --dir mini-program exec vitest run tests/onboarding-domain.test.ts`

Expected: PASS。

### Task 2: 固定在线预览的数值来源

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Modify: `cloudbase/functions/get-login-ticket/deepseek-nutrition-plan-service.cjs`
- Test: `cloudbase/functions/get-login-ticket/index.test.mjs`

- [x] **Step 1: 写入失败测试**

构造 AI 返回与公式不同的宏量数值，断言 `/nutrition-plan/preview` 保留公式数值，仅采用 AI 洞察。

- [x] **Step 2: 执行并确认失败**

Run: `node --test cloudbase/functions/get-login-ticket/index.test.mjs`

Expected: 失败，当前路由会直接返回 AI 生成的数值。

- [x] **Step 3: 实现数值与洞察分离**

预览路由先调用 `formulaNutritionPlanFallback(body)`；仅在 AI 有可用洞察时替换 `insight`，保留公式的 `calories`、`proteinG`、`carbsG`、`fatG` 与 `source: "formula"`。

- [x] **Step 4: 运行服务端测试**

Run: `node --test cloudbase/functions/get-login-ticket/index.test.mjs cloudbase/functions/get-login-ticket/nutrition-plan-formula.test.mjs`

Expected: PASS。

### Task 3: 保留编辑链路的很高活动量

**Files:**
- Modify: `mini-program/src/features/onboarding/domain.ts`
- Modify: `mini-program/src/features/onboarding/hydrate-draft-from-account.ts`
- Test: `mini-program/tests/hydrate-draft-from-account.test.ts`

- [x] **Step 1: 写入失败测试**

断言 `draftPatchFromAccount` 接收 `very_high` 后不再降级成 `high`。

- [x] **Step 2: 执行并确认失败**

Run: `pnpm --dir mini-program exec vitest run tests/hydrate-draft-from-account.test.ts`

Expected: 失败，当前函数返回 `high`。

- [x] **Step 3: 保留原始等级**

扩展前端 `ActivityLevel` 类型，原样返回 `very_high`，使设置页预览请求继续传递真实活动量。

- [x] **Step 4: 验证小程序构建**

Run: `pnpm --dir mini-program exec vitest run tests/onboarding-domain.test.ts tests/hydrate-draft-from-account.test.ts && pnpm --dir mini-program run typecheck && pnpm --dir mini-program run lint && pnpm --dir mini-program run build:weapp && pnpm --dir mini-program run verify:weapp`

Expected: PASS。
