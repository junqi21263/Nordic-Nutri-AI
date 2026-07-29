# 食物图片管理后台改版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将本地食物图片管理页改为三栏审核工作台，并安全发布为 CloudBase 静态托管的独立管理页。

**Architecture:** 保持单一静态 HTML 文件和现有 `/api/admin` 调用契约。页面在浏览器内维护选中批次、筛选状态、选中 job 和选中候选图；所有写操作仍通过既有管理员 Bearer Token 调用，Token 仅保存在输入框内存中。

**Tech Stack:** 原生 HTML、CSS、浏览器 Fetch API、CloudBase Static Hosting、Node.js 静态语法检查。

---

### Task 1: 建立审核工作台结构与视觉令牌

**Files:**
- Modify: `cloudbase/admin/food-images.html:1-284`
- Test: `cloudbase/admin/food-images.html` 内联脚本静态检查

- [ ] **Step 1: 写入页面状态与布局骨架**

将现有纵向面板改为 `header → workspace → utility drawer`。`workspace` 包含以下固定区：

```html
<main class="ops-shell">
  <header class="ops-header">...</header>
  <section class="ops-workspace">
    <aside class="batch-rail">...</aside>
    <section class="review-queue">...</section>
    <aside class="review-inspector">...</aside>
  </section>
  <details class="utility-drawer">...</details>
</main>
```

使用 CSS 变量 `--ink: #173D2A`、`--green: #2E6046`、`--mist: #E8EFE7`、`--linen: #FAF8F3`、`--danger: #B64A3B`。桌面使用三栏，窄屏依次降级为批次、候选图、检查器。

- [ ] **Step 2: 运行静态脚本检查**

Run:

```bash
sed -n '/<script>/,/<\\/script>/p' cloudbase/admin/food-images.html | sed '1d;$d' | node --check
git diff --check -- cloudbase/admin/food-images.html
```

Expected: 两个命令均以 `0` 退出。

### Task 2: 将批次项目转化为可审核候选图队列

**Files:**
- Modify: `cloudbase/admin/food-images.html:现有 refreshBatches、renderBatchDetail、loadJob 逻辑`
- Test: `cloudbase/functions/get-login-ticket/food-image-batch-service.test.mjs`（只读回归执行）

- [ ] **Step 1: 写入批次选择与队列筛选状态**

定义并维护：

```js
let activeBatchId = "";
let activeFilter = "needs_review";
let selectedJobId = "";
let selectedImageId = "";
```

`refreshBatches()` 优先选择最新运行中批次，否则选择最新含 `reviewCount` 的批次。`renderReviewQueue(data.items)` 仅在默认筛选中显示 `status === "needs_review" && jobId` 的项；其他筛选显示生成中、失败或全部项目。

- [ ] **Step 2: 在食物卡片点击时加载候选图**

通过既有端点加载，不添加服务端接口：

```js
const data = await api(`/food-image-jobs/${jobId}`);
```

把 `data.candidates` 渲染为图片缩略图；选中候选后写入 `selectedImageId` 和原有 `#imageId` 输入框。图片 `alt` 为食物中文名，加载失败时显示“重新加载候选图”按钮。

- [ ] **Step 3: 在检查器调用既有审核端点并刷新状态**

通过保留现有契约完成审核：

```js
await api(`/food-images/${selectedImageId}/approve`, { method: "POST", body: {} });
await api(`/food-images/${selectedImageId}/reject`, { method: "POST", body: { reason } });
await refreshBatches();
```

拒绝按钮必须先取得非空原因；成功后清空当前图片选择，刷新统计、批次进度和审核队列。

- [ ] **Step 4: 运行既有批次服务回归测试**

Run:

```bash
node --test cloudbase/functions/get-login-ticket/food-image-batch-service.test.mjs
```

Expected: PASS，且没有修改云函数代码。

### Task 3: 保留排障功能并完成交互校验

**Files:**
- Modify: `cloudbase/admin/food-images.html:连接设置、任务创建、响应区域`
- Test: `cloudbase/admin/food-images.html` 浏览器运行时检查

- [ ] **Step 1: 将连接设置与手动任务移入折叠工具区**

保留 API Base、Bearer Token、刷新统计、诊断混元、手动创建任务、按 jobId 加载和原始响应；默认折叠。页面禁止把 Token 写入 `localStorage`、URL、页面日志或静态托管文件。

- [ ] **Step 2: 添加明确空态与状态文案**

当没有待审核图片时展示“当前批次已审核完”；当未连接时展示“填写管理员会话后加载批次”；当批次失败时展示失败数量和“查看失败项”筛选。所有状态同时使用文字和颜色。

- [ ] **Step 3: 静态与浏览器验证**

Run:

```bash
sed -n '/<script>/,/<\\/script>/p' cloudbase/admin/food-images.html | sed '1d;$d' | node --check
git diff --check -- cloudbase/admin/food-images.html
```

在浏览器验证：填写管理员会话、选择 `首轮样本-基础食材-20`、加载一张候选图、确认通过按钮可用但不点击；切换“失败”筛选；确认 API Base 与 Token 没有出现在 URL 或持久化存储中。

### Task 4: 发布到 CloudBase 静态托管并验证

**Files:**
- Source: `cloudbase/admin/food-images.html`
- Deploy target: 主环境 `lewis-healthy-d4glgqqzv73a5bc10` 的静态托管 `/admin/food-images.html`

- [ ] **Step 1: 检查静态托管状态与目标路径**

Run:

```bash
tcb hosting detail --env-id lewis-healthy-d4glgqqzv73a5bc10
tcb hosting list --env-id lewis-healthy-d4glgqqzv73a5bc10 --limit 100
```

Expected: 静态托管可用；确认 `/admin/food-images.html` 不会覆盖其他业务页面。

- [ ] **Step 2: 发布单文件，不清空 Hosting 根目录**

Run:

```bash
tcb hosting deploy cloudbase/admin/food-images.html /admin/food-images.html --env-id lewis-healthy-d4glgqqzv73a5bc10 --yes
```

Expected: 上传成功；不使用删除或全量覆盖命令。

- [ ] **Step 3: 通过 Hosting 域名验证公开静态页**

打开 Hosting URL，确认页面返回 `200` 且只显示连接设置，不含任何 Token。用管理员会话完成一次只读加载，确认批次与候选图显示。

## 计划自检

- 规格中的三栏、候选图优先、折叠提示词/排障、无 Token 持久化、响应式和原有 API 保留，分别由 Task 1–3 覆盖。
- 发布只更新 `/admin/food-images.html`，由 Task 4 覆盖，不删除 Hosting 中其他资产。
- 本计划没有新增服务端接口、数据库表或权限规则；所有审核与任务 API 均为已有路径。
