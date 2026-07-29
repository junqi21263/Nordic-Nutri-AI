# 教练对话重启与今日营养建议 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 Nordic Nutri AI 教练页中加入安全的每日随机建议、可保留历史的重启对话，并把输入框固定为方案 A 的圆角长方形。

**Architecture:** 继续使用现有 CloudBase `get-login-ticket` HTTP 函数作为 DeepSeek 和教练会话边界。新增每日建议服务和重启会话服务，不新增数据库表；小程序通过 typed API 调用它们，DeepSeek Key 只由云函数环境变量读取。页面使用现有 PageLayout/AppTopBar 扩展右侧操作，并保留现有流式聊天、图片与快捷提问链路。

**Tech Stack:** Taro 4、React 18、TypeScript、SCSS/WXSS、CloudBase Node HTTP Function、CloudBase PostgreSQL、DeepSeek Chat Completions、Vitest、Node test runner。

---

## 文件地图

- Create: `cloudbase/functions/get-login-ticket/daily-tip-service.cjs` — 每日建议类型、兜底池、DeepSeek JSON 校验。
- Create: `cloudbase/functions/get-login-ticket/daily-tip-service.test.mjs` — 每日建议服务的失败优先测试。
- Modify: `cloudbase/functions/get-login-ticket/coach-data-service.cjs` — 暴露 `restartConversation` 与 `getDailyTip`，复用现有营养上下文。
- Modify: `cloudbase/functions/get-login-ticket/coach-data-service.test.mjs` — 会话归档、新会话与每日建议服务测试。
- Modify: `cloudbase/functions/get-login-ticket/index.js` — 注册 `/coach/restart` 与 `/coach/daily-tip` 路由。
- Modify: `cloudbase/functions/get-login-ticket/index.test.mjs` — 路由、认证和 HTTP 方法回归。
- Modify: `mini-program/src/api/coach-api.ts` — 新增每日建议和重启 API 类型/函数。
- Modify: `mini-program/src/pages/coach/index.tsx` — 动态卡片、换一条、方案 A 重启交互。
- Modify: `mini-program/src/pages/coach/components/CoachComposer/index.scss` — 保留唯一长方形输入框样式。
- Modify: `mini-program/src/styles/page.scss` — 删除旧的重复胶囊 composer 定义。
- Modify: `mini-program/src/components/app-top-bar/index.tsx` — 支持品牌栏右侧操作。
- Modify: `mini-program/src/layouts/page-layout/index.tsx` — 将可选品牌栏右侧操作传给 AppTopBar。
- Modify: `mini-program/tests/coach-api-boundary.test.ts` — API 和页面契约断言。
- Modify: `mini-program/tests/coach-composer.test.ts` — 输入框和重启文案/样式契约。

## Task 1: 建立每日建议服务的失败测试

**Files:**
- Create: `cloudbase/functions/get-login-ticket/daily-tip-service.test.mjs`
- Create: `cloudbase/functions/get-login-ticket/daily-tip-service.cjs`

- [ ] **Step 1: 写每日建议输入与输出校验测试**

在测试文件中覆盖以下断言：

```js
import test from "node:test";
import assert from "node:assert/strict";
import { createDailyTipService, validateDailyTip } from "./daily-tip-service.cjs";

test("validateDailyTip accepts the three public tip types", () => {
  for (const type of ["nutrition_tip", "food_function", "food_knowledge"]) {
    assert.deepEqual(
      validateDailyTip({ type, headline: "补充深色蔬菜", content: "今天的一餐可以加入一份深色蔬菜。" }),
      { type, headline: "补充深色蔬菜", content: "今天的一餐可以加入一份深色蔬菜。", food: null },
    );
  }
});

test("validateDailyTip rejects unsafe or oversized model output", () => {
  assert.throws(() => validateDailyTip({ type: "nutrition_tip", headline: "治疗糖尿病", content: "请用它替代药物。" }), /DAILY_TIP_RETRYABLE/);
  assert.throws(() => validateDailyTip({ type: "nutrition_tip", headline: "a".repeat(33), content: "有效内容" }), /DAILY_TIP_RETRYABLE/);
});

test("service falls back when DeepSeek is unavailable", async () => {
  const service = createDailyTipService({
    contextProvider: async () => ({ daily: { remaining: { protein: 20 } }, goalType: "muscle_gain" }),
    requestCompletion: async () => { throw new Error("timeout"); },
    random: () => 0,
  });
  const result = await service({ date: "2026-07-29" });
  assert.equal(result.source, "rule_v2");
  assert.equal(result.type, "nutrition_tip");
  assert.ok(result.headline);
  assert.ok(result.content);
});

test("service sends only bounded context and returns deepseek result", async () => {
  let request;
  const service = createDailyTipService({
    contextProvider: async () => ({ daily: { remaining: { protein: 20 } }, goalType: "muscle_gain" }),
    requestCompletion: async (input) => { request = input; return { type: "food_function", headline: "燕麦的饱腹感", content: "燕麦含有膳食纤维，可作为均衡早餐的一部分。" }; },
    random: () => 0.5,
  });
  const result = await service({ date: "2026-07-29" });
  assert.equal(result.source, "deepseek");
  assert.equal(result.type, "food_function");
  assert.equal(request.type, "food_function");
  assert.equal(request.context.goalType, "muscle_gain");
});
```

- [ ] **Step 2: 运行测试确认先失败**

运行：`node --test cloudbase/functions/get-login-ticket/daily-tip-service.test.mjs`

预期：FAIL，提示 `daily-tip-service.cjs` 尚不存在或导出不存在。

## Task 2: 实现每日建议服务

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/daily-tip-service.cjs`
- Test: `cloudbase/functions/get-login-ticket/daily-tip-service.test.mjs`

- [ ] **Step 1: 实现类型、字段和危险措辞校验**

实现 `validateDailyTip(payload)`：只接受三个 `type`；`headline` 最长 32 字、`content` 最长 120 字；可选 `food` 必须是 `{ name, proteinG }`，否则标准化为 `null`；使用 `/诊断|治疗|处方|药物|用药|孕期|怀孕|哺乳|厌食|暴食|替代医疗/i` 拒绝不安全文案。

- [ ] **Step 2: 实现兜底池与 DeepSeek 请求工厂**

导出 `createDailyTipService({ contextProvider, requestCompletion, random })`。它必须：

```js
const DAILY_TIP_TYPES = ["nutrition_tip", "food_function", "food_knowledge"];
const selectedType = DAILY_TIP_TYPES[Math.min(DAILY_TIP_TYPES.length - 1, Math.floor(random() * DAILY_TIP_TYPES.length))];
```

`requestCompletion` 缺省时通过 `fetch("https://api.deepseek.com/chat/completions")` 使用函数传入的 `apiKey` 和 `model`；请求体使用 `response_format: { type: "json_object" }`、`temperature: 0.8`、`max_tokens: 220`，system prompt 要求只输出允许字段。不得记录 authorization header、完整 Key 或用户上下文。

- [ ] **Step 3: 实现异常统一回退**

日期无效、模型异常、解析失败、校验失败、超时都返回 `source: "rule_v2"` 的安全池结果；成功模型结果返回 `source: "deepseek"` 和模型名。测试：`node --test cloudbase/functions/get-login-ticket/daily-tip-service.test.mjs`，预期 PASS。

- [ ] **Step 4: 提交独立后端建议服务**

```bash
git add cloudbase/functions/get-login-ticket/daily-tip-service.cjs cloudbase/functions/get-login-ticket/daily-tip-service.test.mjs
git commit -m "feat: add safe daily nutrition tip service"
```

## Task 3: 扩展教练数据服务与 HTTP 路由

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/coach-data-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Modify: `cloudbase/functions/get-login-ticket/coach-data-service.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/index.test.mjs`

- [ ] **Step 1: 写会话重启和 HTTP 路由失败测试**

在现有测试中断言：`restartConversation(userId)` 更新当前 `archived_at`、插入新会话并返回新 ID；`getMessages` 不再读取旧会话；未认证请求为 401；`POST /coach/restart` 和 `GET /coach/daily-tip` 方法正确；错误日期返回 400。

- [ ] **Step 2: 实现 `restartConversation`**

在 `createCoachDataService` 内新增方法：先用现有查询找 `archived_at is null` 的当前会话；存在则执行 `.update({ archived_at: new Date().toISOString() }).eq("id", id).eq("user_id", userId)`；再插入 `{ user_id: userId, title: "营养教练" }`，返回 `{ conversationId: created.data.id, messages: [] }`。任何数据库错误抛出现有服务错误，不向客户端返回数据库原文。

- [ ] **Step 3: 接入每日建议上下文提供器**

给 `createCoachDataService` 增加 `dailyTip` 和 `getDailyTip` 依赖；`buildContext(userId, date)` 已同时读取 daily、weekly、account，直接传给每日建议服务。`getDailyTip(userId, date)` 只接受合法日期并调用 `dailyTip({ date, context })`。

- [ ] **Step 4: 注册路由和处理方法**

`getCoachRoute` 增加：

```js
if (path === "/coach/restart") return "restartConversation";
if (path === "/coach/daily-tip") return "getDailyTip";
```

在 coach handler 中增加：

```js
if (coachOperation === "restartConversation" && req.method === "POST") {
  return sendJson(res, 200, await service.coach.restartConversation(session.sub));
}
if (coachOperation === "getDailyTip" && req.method === "GET") {
  const date = url.searchParams.get("date");
  if (!date) return sendJson(res, 400, { code: "COACH_INPUT_INVALID" });
  return sendJson(res, 200, await service.coach.getDailyTip(session.sub, date));
}
```

初始化服务时把 `createDailyTipService` 作为 `dailyTip` 依赖注入；没有 `DEEPSEEK_API_KEY` 时传入 `null`，由服务内置池回退。

- [ ] **Step 5: 运行后端回归**

运行：`node --test cloudbase/functions/get-login-ticket/daily-tip-service.test.mjs cloudbase/functions/get-login-ticket/coach-data-service.test.mjs cloudbase/functions/get-login-ticket/index.test.mjs`

预期：新增测试和既有 coach HTTP 测试全部 PASS。

- [ ] **Step 6: 提交后端 API**

```bash
git add cloudbase/functions/get-login-ticket/coach-data-service.cjs cloudbase/functions/get-login-ticket/index.js cloudbase/functions/get-login-ticket/coach-data-service.test.mjs cloudbase/functions/get-login-ticket/index.test.mjs
git commit -m "feat: add coach restart and daily tip endpoints"
```

## Task 4: 增加前端 API 边界

**Files:**
- Modify: `mini-program/src/api/coach-api.ts`
- Modify: `mini-program/tests/coach-api-boundary.test.ts`

- [ ] **Step 1: 写前端契约测试**

断言 `coach-api.ts` 导出 `ProductCoachDailyTip`、`getProductCoachDailyTip`、`restartProductCoachConversation`，并包含 `/coach/daily-tip`、`/coach/restart`；页面包含对应调用和中文 UI 文案。

- [ ] **Step 2: 实现 typed API**

增加：

```ts
export interface ProductCoachDailyTip {
  type: "nutrition_tip" | "food_function" | "food_knowledge";
  headline: string;
  content: string;
  food: { name: string; proteinG: number } | null;
  source: "deepseek" | "rule_v2";
  model: string | null;
}

export function getProductCoachDailyTip(date: string) {
  return requestProductApi<ProductCoachDailyTip>(`/coach/daily-tip?date=${encodeURIComponent(date)}`, {
    method: "GET",
    fallbackMessage: "今日营养建议暂时无法读取，请稍后重试",
  });
}

export function restartProductCoachConversation() {
  return requestProductApi<{ conversationId: string; messages: ProductCoachMessage[] }>("/coach/restart", {
    method: "POST",
    data: {},
    fallbackMessage: "重启对话失败，请稍后重试",
  });
}
```

- [ ] **Step 3: 运行契约与类型检查**

运行：`pnpm exec vitest run mini-program/tests/coach-api-boundary.test.ts` 和 `pnpm run typecheck:mini-program`，预期 PASS。

- [ ] **Step 4: 提交前端 API 边界**

```bash
git add mini-program/src/api/coach-api.ts mini-program/tests/coach-api-boundary.test.ts
git commit -m "feat: add coach daily tip and restart api"
```

## Task 5: 实现方案 A 页面交互

**Files:**
- Modify: `mini-program/src/pages/coach/index.tsx`
- Modify: `mini-program/src/layouts/page-layout/index.tsx`
- Modify: `mini-program/src/components/app-top-bar/index.tsx`
- Modify: `mini-program/tests/coach-api-boundary.test.ts`

- [ ] **Step 1: 扩展品牌栏右侧操作契约**

给 `AppTopBarProps` 增加 `rightAction?: string` 与 `onRightAction?: () => void`；在右侧 `app-top-bar__side--right` 渲染一个 `View`，文本为 `rightAction`，无值时不渲染。给 `PageLayoutProps` 增加同名 `topBarAction`/`onTopBarAction` 并透传。非 coach 页面不传值，视觉保持不变。

- [ ] **Step 2: 加入重启状态和确认流程**

在 coach 页面增加 `restarting` 状态和 `handleRestartConversation`：当正在发送或重启时直接返回；调用 `Taro.showModal`，仅在 `confirm` 为真时调用 `restartProductCoachConversation()`；成功后 `setMessages([createProactiveMessage()])`、清空 draft/image、重新调用 `refreshCoachBrief()` 和 `loadDailyTip()`；失败显示 `feedback.show({ message: "重启对话失败，请稍后重试", tone: "error" })`。将 `topBarAction="重启对话"` 和 `onTopBarAction={...}` 传给 PageLayout。

- [ ] **Step 3: 加入每日建议状态、加载和换一条**

增加 `dailyTip`、`dailyTipLoading` 状态；`loadDailyTip()` 调用 typed API，成功保存结果，失败保留上一条或使用前端短兜底。首次 `useEffect` 依赖 `date` 调用一次；卡片的“换一条”点击调用同一函数并在请求期间禁用。

- [ ] **Step 4: 替换卡片静态文案**

把 `AI 建议` 替换为 `今日营养建议`；标题和正文绑定 `dailyTip.headline`/`dailyTip.content`；增加 `换一条` 文本操作；只有 `dailyTip.food` 存在时渲染可点击的现有加餐卡片，使用返回的食品名称和蛋白质数量。每日建议加载中显示 `正在整理今日营养建议…`。

- [ ] **Step 5: 运行前端测试**

运行：`pnpm exec vitest run mini-program/tests/coach-api-boundary.test.ts mini-program/tests/coach-composer.test.ts` 和 `pnpm run typecheck:mini-program`，预期 PASS。

- [ ] **Step 6: 提交页面交互**

```bash
git add mini-program/src/pages/coach/index.tsx mini-program/src/layouts/page-layout/index.tsx mini-program/src/components/app-top-bar/index.tsx mini-program/tests/coach-api-boundary.test.ts
git commit -m "feat: add coach restart and daily tip ui"
```

## Task 6: 固化长方形输入框视觉

**Files:**
- Modify: `mini-program/src/pages/coach/components/CoachComposer/index.scss`
- Modify: `mini-program/src/styles/page.scss`
- Create or modify: `mini-program/tests/coach-composer.test.ts`

- [ ] **Step 1: 写样式回归断言**

测试读取两个 SCSS 文件，断言组件样式包含 `.coach-composer__input`、`border-radius: 12px`，且旧 page 样式不再定义 `.coach-composer` 的 `$radius-full`。

- [ ] **Step 2: 清理重复旧样式**

删除 `page.scss` 中旧 `.coach-composer`、`.coach-composer__placeholder` 和旧 `.coach-composer__send` 块；保留组件 SCSS 中的玻璃底栏、12px 输入框圆角和方形按钮定义。不得改动底部偏移计算。

- [ ] **Step 3: 运行 WXSS 与样式测试**

运行：`pnpm exec vitest run mini-program/tests/coach-composer.test.ts` 和 `node scripts/verify-weapp-wxss.mjs`，预期 PASS。

- [ ] **Step 4: 提交视觉修复**

```bash
git add mini-program/src/pages/coach/components/CoachComposer/index.scss mini-program/src/styles/page.scss mini-program/tests/coach-composer.test.ts
git commit -m "fix: make coach composer a rounded rectangle"
```

## Task 7: 全量验证与交付检查

**Files:**
- Verify only; no unrelated file changes.

- [ ] **Step 1: 运行后端全部测试**

运行：`pnpm exec vitest run cloudbase/functions/get-login-ticket`，预期所有测试 PASS。

- [ ] **Step 2: 运行小程序全部测试与类型检查**

运行：`pnpm exec vitest run mini-program/tests` 和 `pnpm run typecheck:mini-program`，预期全部 PASS。

- [ ] **Step 3: 构建微信小程序并检查输出**

运行项目现有微信构建命令，确认 `mini-program/dist/weapp/app.json` 存在；再运行 `node scripts/verify-weapp-wxss.mjs`。检查构建产物中不存在 `DEEPSEEK_API_KEY`、`api.deepseek.com` 或后端 system prompt。

- [ ] **Step 4: 检查工作区范围**

运行：`git status --short`。只接受本次 feature 文件、已提交的设计/计划文档和用户已有的三处测试改动；不覆盖、不清理用户已有修改。

- [ ] **Step 5: 真机/微信开发者工具验收**

使用已配置 CloudBase 函数环境的开发者工具构建产物，依次验证：

1. 输入框为长方形，键盘弹起时不遮挡；
2. 顶部“重启对话”确认后显示新开场，旧消息在数据库中仍保留；
3. “今日营养建议”首次加载成功；
4. “换一条”会更换内容或稳定回退；
5. 发文字、发图片和快捷提问仍然正常；
6. 临时移除或禁用 DeepSeek Key 后，页面显示规则兜底且不暴露服务端错误。

- [ ] **Step 6: 完成提交**

```bash
git status --short
git log -5 --oneline
```

最终交付时分别说明自动化测试、构建静态证据和微信运行时验收状态，不把“Key 已配置”或“函数已发布”当作未实际验证的事实。
