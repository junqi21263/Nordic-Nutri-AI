# 分类批量生图与审核流程 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让管理员按单一食物分类创建 1--100 条无主图食物的批次，并由云端持续生成、人工审核和按拒绝原因自动重试。

**Architecture:** `get-login-ticket` 保持为受管理员会话保护的管理 API，并在服务端冻结分类选出的食物 ID。一个独立的定时函数使用时间戳 HMAC 调用仅供内部使用的批次调度路由；调度路由按锁和并发限制执行批次项。审核台只发起创建和状态操作、轮询结果，不再承担浏览器 Worker。

**Tech Stack:** CloudBase PostgreSQL、CloudBase HTTP 云函数、CloudBase 定时函数、Node.js 18 CommonJS、`node:test`、静态审核页 `cloudbase/admin/food-images.html`、混元远程 HMAC Worker。

---

## 文件范围

### 新建

- `cloudbase/pg/migrations/0018_food_image_batch_dispatch.sql`：批次项重试原因和最近候选图字段的幂等迁移。
- `cloudbase/functions/get-login-ticket/food-image-dispatch-auth.cjs`：内部调度请求 HMAC 签名与校验。
- `cloudbase/functions/get-login-ticket/food-image-dispatch-auth.test.mjs`：签名、过期时间和错误签名测试。
- `cloudbase/functions/food-image-batch-dispatcher/index.js`：每分钟调用内部调度路由的定时函数。
- `cloudbase/functions/food-image-batch-dispatcher/index.test.mjs`：定时函数请求签名和失败返回测试。
- `cloudbase/functions/food-image-batch-dispatcher/package.json`：定时函数运行时元数据。

### 修改

- `cloudbase/functions/get-login-ticket/food-repository.cjs`、`.test.mjs`：单分类无主图候选预览和稳定选择。
- `cloudbase/functions/get-login-ticket/food-image-batch-service.cjs`、`.test.mjs`：分类创建、批次调度、锁回收与统计。
- `cloudbase/functions/get-login-ticket/food-image-job-service.cjs`、`.test.mjs`：审核拒绝同步批次项和带拒绝原因的重试。
- `cloudbase/functions/get-login-ticket/food-image-prompts.cjs`、`.test.mjs`：把 `retryReason` 写入下一次生图约束。
- `cloudbase/functions/get-login-ticket/index.js`、`.test.mjs`：预览、创建和内部调度路由。
- `cloudbase/admin/food-images.html`、`.test.mjs`：顶部控制台、创建弹窗、批次状态操作和队列刷新。
- `docs/FOOD_IMAGE_GENERATION.md`：部署、环境变量和真实批次验收说明。

## Task 1: 补齐批次项审计字段

**Files:**
- Create: `cloudbase/pg/migrations/0018_food_image_batch_dispatch.sql`
- Test: `scripts/cloudbase/verify-schema.test.mjs`

- [ ] **Step 1: 先写 schema 静态断言。**

在 `scripts/cloudbase/verify-schema.test.mjs` 增加一个测试，读取 `0018_food_image_batch_dispatch.sql` 并断言包含：

```js
assert.match(sql, /add column if not exists last_image_id uuid references public\.food_images/i);
assert.match(sql, /add column if not exists retry_reason text/i);
assert.match(sql, /check \(char_length\(retry_reason\) <= 500\)/i);
```

- [ ] **Step 2: 运行测试确认失败。**

Run: `node --test scripts/cloudbase/verify-schema.test.mjs`

Expected: 新增断言因迁移文件尚不存在而失败。

- [ ] **Step 3: 写最小幂等迁移。**

创建迁移，使用以下 SQL；不重建 `0017` 已创建的表和索引：

```sql
alter table public.food_image_batch_items
  add column if not exists last_image_id uuid references public.food_images(id) on delete set null,
  add column if not exists retry_reason text;

alter table public.food_image_batch_items
  drop constraint if exists food_image_batch_items_retry_reason_length;
alter table public.food_image_batch_items
  add constraint food_image_batch_items_retry_reason_length
  check (retry_reason is null or char_length(retry_reason) <= 500);

create index if not exists food_image_batch_items_running_claim_idx
  on public.food_image_batch_items (status, next_retry_at, created_at)
  where status in ('pending', 'needs_retry');
```

- [ ] **Step 4: 运行 schema 测试。**

Run: `node --test scripts/cloudbase/verify-schema.test.mjs`

Expected: PASS。

- [ ] **Step 5: 提交该独立迁移。**

Run: `git add cloudbase/pg/migrations/0018_food_image_batch_dispatch.sql scripts/cloudbase/verify-schema.test.mjs && git commit -m "feat: add image batch retry audit fields"`

只暂存以上两个文件，不包含已有未提交改动。

## Task 2: 服务端按分类预览并冻结选择

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/food-repository.cjs`
- Modify: `cloudbase/functions/get-login-ticket/food-repository.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/food-image-batch-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/food-image-batch-service.test.mjs`

- [ ] **Step 1: 为仓库方法写失败测试。**

在仓库测试中为 `listBatchImageCandidates({ categoryId, count })` 增加 fake-db 断言：它必须查询 `foods` 的 `is_active=true`、`publish_status='published'`、`primary_image_id is null` 和准确的 `category_id`，并按 `name_zh`、`id` 升序；`count` 必须被限制到 1--100。

在批次服务测试中写入：

```js
test("category preview excludes ready and active foods before freezing 20 IDs", async () => {
  const result = await service.previewCategory("admin-1", { categoryId: "cat-1", count: 20 });
  assert.equal(result.selectableCount, 23);
  assert.deepEqual(result.foodIds, ["food-01", "food-02"]);
});

test("createFromCategory stores the previewed IDs rather than client supplied IDs", async () => {
  const batch = await service.createFromCategory("admin-1", { categoryId: "cat-1", count: 20, name: "蔬菜-01" });
  assert.equal(batch.selection.categoryId, "cat-1");
  assert.equal(batch.totalCount, 20);
});
```

- [ ] **Step 2: 运行新增测试确认失败。**

Run: `node --test cloudbase/functions/get-login-ticket/food-repository.test.mjs cloudbase/functions/get-login-ticket/food-image-batch-service.test.mjs`

Expected: FAIL，因为两个新方法尚未导出。

- [ ] **Step 3: 实现稳定候选查询。**

在仓库层新增 `listBatchImageCandidates({ categoryId, count })`，先验证 `categoryId` 存在且激活，再查询候选食物。批次服务新增：

```js
previewCategory(userId, { categoryId, count })
createFromCategory(userId, { categoryId, count, name, concurrency = 2, maxAttempts = 3 })
```

`previewCategory` 必须以活动批次项的 `food_id` 过滤候选并返回 `selectableCount`、`readyCount`、`activeConflictCount`、`foodIds`。`createFromCategory` 必须重新执行同一查询，将结果写入 `selection_json = { source: 'category-missing-primary', categoryId, requestedCount }`，再复用现有 `create` 写入冻结的 ID。客户端传入 `foodIds` 时忽略该字段。

- [ ] **Step 4: 运行服务测试。**

Run: `node --test cloudbase/functions/get-login-ticket/food-repository.test.mjs cloudbase/functions/get-login-ticket/food-image-batch-service.test.mjs`

Expected: PASS。

- [ ] **Step 5: 提交选材实现。**

Run: `git add cloudbase/functions/get-login-ticket/food-repository.cjs cloudbase/functions/get-login-ticket/food-repository.test.mjs cloudbase/functions/get-login-ticket/food-image-batch-service.cjs cloudbase/functions/get-login-ticket/food-image-batch-service.test.mjs && git commit -m "feat: select image batches from one category"`

## Task 3: 审核拒绝触发带原因的重试

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/food-image-prompts.cjs`
- Modify: `cloudbase/functions/get-login-ticket/food-image-prompts.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/food-image-job-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/food-image-job-service.test.mjs`

- [ ] **Step 1: 写提示词与拒绝状态的失败测试。**

新增以下断言：

```js
test("retry prompt appends the human rejection constraint", () => {
  const plan = buildFoodImagePromptPlan({ foodNameZh: "鸡蛋", category: "蛋类", retryReason: "不要切开的鸡蛋" });
  assert.match(plan.extraPrompt, /不要切开的鸡蛋/);
});

test("rejecting a batch candidate marks it retryable before the third attempt", async () => {
  await service.rejectImage("admin", "image-1", { reason: "主体应为完整鸡蛋" });
  assert.deepEqual(batchItemUpdate.payload, { status: "needs_retry", retry_reason: "主体应为完整鸡蛋", next_retry_at: null });
});
```

- [ ] **Step 2: 运行测试确认失败。**

Run: `node --test cloudbase/functions/get-login-ticket/food-image-prompts.test.mjs cloudbase/functions/get-login-ticket/food-image-job-service.test.mjs`

Expected: FAIL，因为 `retryReason` 和批次项状态同步尚不存在。

- [ ] **Step 3: 实现最小重试链路。**

让 `buildFoodImagePromptPlan` 接收可选 `retryReason`，将经 `trim().slice(0, 500)` 的原因追加至 `extraPrompt`，前缀为“上一张被拒绝，必须修正：”。在 `rejectImage` 中按 `image.job_id` 查询对应批次项：`attempt_count < max_attempts` 时更新 `needs_retry`、`retry_reason`、清空错误字段和 `next_retry_at`；否则更新 `failed` 与 `retry_reason`。保持候选图记录为 rejected，不修改 `foods.primary_image_id`。

让 `processNext` 读取批次项的 `retry_reason`，传给提示词计划，并在生成成功后写 `last_image_id`、`prompt_plan_json`；每次尝试仍只生成一个候选图。

- [ ] **Step 4: 运行测试。**

Run: `node --test cloudbase/functions/get-login-ticket/food-image-prompts.test.mjs cloudbase/functions/get-login-ticket/food-image-job-service.test.mjs cloudbase/functions/get-login-ticket/food-image-batch-service.test.mjs`

Expected: PASS。

- [ ] **Step 5: 提交审核重试链路。**

Run: `git add cloudbase/functions/get-login-ticket/food-image-prompts.cjs cloudbase/functions/get-login-ticket/food-image-prompts.test.mjs cloudbase/functions/get-login-ticket/food-image-job-service.cjs cloudbase/functions/get-login-ticket/food-image-job-service.test.mjs cloudbase/functions/get-login-ticket/food-image-batch-service.cjs cloudbase/functions/get-login-ticket/food-image-batch-service.test.mjs && git commit -m "feat: retry rejected food images with review feedback"`

## Task 4: 添加受签名保护的云端调度器

**Files:**
- Create: `cloudbase/functions/get-login-ticket/food-image-dispatch-auth.cjs`
- Create: `cloudbase/functions/get-login-ticket/food-image-dispatch-auth.test.mjs`
- Create: `cloudbase/functions/food-image-batch-dispatcher/index.js`
- Create: `cloudbase/functions/food-image-batch-dispatcher/index.test.mjs`
- Create: `cloudbase/functions/food-image-batch-dispatcher/package.json`
- Modify: `cloudbase/functions/get-login-ticket/food-image-batch-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/food-image-batch-service.test.mjs`

- [ ] **Step 1: 写 HMAC 与调度循环失败测试。**

签名测试使用 `crypto.createHmac('sha256', secret)` 并覆盖：当前时间有效、超过五分钟失败、签名不同失败。批次服务测试加入：

```js
test("dispatchRunningBatches processes at most batch concurrency in one round", async () => {
  const result = await service.dispatchRunningBatches({ maxRounds: 1 });
  assert.equal(result.claimed, 2);
  assert.equal(processedFoodIds.length, 2);
});

test("paused batches are never claimed by the system dispatcher", async () => {
  const result = await service.dispatchRunningBatches({ maxRounds: 1 });
  assert.equal(result.claimed, 0);
});
```

- [ ] **Step 2: 运行测试确认失败。**

Run: `node --test cloudbase/functions/get-login-ticket/food-image-dispatch-auth.test.mjs cloudbase/functions/get-login-ticket/food-image-batch-service.test.mjs cloudbase/functions/food-image-batch-dispatcher/index.test.mjs`

Expected: FAIL，因为认证模块、调度函数和系统入口均不存在。

- [ ] **Step 3: 实现签名与系统调度。**

签名规范为 `timestamp + '\nPOST\n' + path + '\n' + body`，请求头为 `x-food-image-dispatch-timestamp` 与 `x-food-image-dispatch-signature`。`verifyDispatchRequest` 使用恒定时间比较，拒绝超过 300 秒的时间戳。

批次服务新增 `dispatchRunningBatches({ deadlineMs = 50000, maxRounds = 25 })`，只读取 `running` 批次；每轮以该批次 `concurrency` 次调用内部不鉴权的 `processNextSystem(batchId)`。后者重用现有条件更新锁，锁定文本改为 `cloudbase-scheduled-dispatcher`。当无可领取项时刷新汇总；所有项终态时写 `completed` 或 `completed_with_errors`。在每轮前检查截止时间，防止定时函数超时。

定时函数使用全局 `fetch` 调用主环境内部路径 `/get-login-ticket/api/internal/food-image-batches/dispatch`，使用 `FOOD_IMAGE_DISPATCH_API_BASE_URL` 和 `FOOD_IMAGE_DISPATCH_SECRET` 环境变量。它只返回调度摘要，不返回图片、提示词或密钥。

- [ ] **Step 4: 运行测试。**

Run: `node --test cloudbase/functions/get-login-ticket/food-image-dispatch-auth.test.mjs cloudbase/functions/get-login-ticket/food-image-batch-service.test.mjs cloudbase/functions/food-image-batch-dispatcher/index.test.mjs`

Expected: PASS。

- [ ] **Step 5: 提交云端调度器。**

Run: `git add cloudbase/functions/get-login-ticket/food-image-dispatch-auth.cjs cloudbase/functions/get-login-ticket/food-image-dispatch-auth.test.mjs cloudbase/functions/get-login-ticket/food-image-batch-service.cjs cloudbase/functions/get-login-ticket/food-image-batch-service.test.mjs cloudbase/functions/food-image-batch-dispatcher && git commit -m "feat: run food image batches from cloud scheduler"`

## Task 5: 接入管理员 API 路由

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Modify: `cloudbase/functions/get-login-ticket/index.test.mjs`

- [ ] **Step 1: 写路由失败测试。**

在 `index.test.mjs` 新增四项：管理员可 GET `/api/admin/food-image-batches/selection-preview?categoryId=cat-1&count=20`；管理员可 POST `/api/admin/food-image-batches` 且请求体只含 `categoryId`、`count`、`name`；无会话返回 401；签名错误的 POST `/api/internal/food-image-batches/dispatch` 返回 401。

- [ ] **Step 2: 运行测试确认失败。**

Run: `node --test cloudbase/functions/get-login-ticket/index.test.mjs`

Expected: FAIL，路由解析仍不认识 selection preview 和 internal dispatch。

- [ ] **Step 3: 实现受限路由。**

在 `getAdminFoodRoute` 增加精确的 `selection-preview` 分支，并确保它在 UUID 批次详情匹配之前。在管理员路由中调用 `foodImageBatches.previewCategory` 和 `createFromCategory`。不要暴露 `processNext` 为常规后台按钮。

在主 HTTP handler 的管理员鉴权之前加入内部路径分支；仅当 `verifyDispatchRequest` 通过时调用 `foodImageBatches.dispatchRunningBatches`。任何 HMAC 错误统一返回 `{ code: 'UNAUTHORIZED' }`，不透露哪个头无效。

- [ ] **Step 4: 运行 API 回归测试。**

Run: `node --test cloudbase/functions/get-login-ticket/index.test.mjs cloudbase/functions/get-login-ticket/food-image-batch-service.test.mjs`

Expected: PASS。

- [ ] **Step 5: 提交路由实现。**

Run: `git add cloudbase/functions/get-login-ticket/index.js cloudbase/functions/get-login-ticket/index.test.mjs && git commit -m "feat: expose category image batch administration"`

## Task 6: 重做审核台顶部控制台

**Files:**
- Modify: `cloudbase/admin/food-images.html`
- Modify: `cloudbase/admin/food-images.test.mjs`

- [ ] **Step 1: 写静态 DOM 失败测试。**

加入断言验证页面包含 `id="createBatch"`、`id="categoryId"`、`id="batchCount"`、`id="batchPreview"`、`id="startBatch"`、`id="pauseBatch"`、`id="resumeBatch"`、`id="cancelBatch"`，且不再包含 `toggleAutoWorker`、`autoRun`、`runWorker` 或 `createFirstSample`。

- [ ] **Step 2: 运行测试确认失败。**

Run: `node --test cloudbase/admin/food-images.test.mjs`

Expected: FAIL，因为现有页面仍使用浏览器 `autoRun` 和固定“首批 20 条”。

- [ ] **Step 3: 实现顶部控制台与创建弹窗。**

页面加载时请求公开食物分类和管理员批次列表。分类选择或数量变化时调用 `selection-preview`，将“可选、已有主图、活动冲突、首轮用量、最多用量”写入 `batchPreview`。创建按钮调用分类批次接口，成功后选择新批次并显示“草稿已创建”。

将批次状态映射为可操作按钮：`draft` 显示启动和取消，`running` 显示暂停，`paused` 显示继续和取消，终态只显示新建批次。移除单步 Worker、自动执行切换、固定首批创建和手工 foodId/jobId 工具。保留右侧 sticky 审核面板和已有的通过/拒绝刷新逻辑。

- [ ] **Step 4: 运行页面测试。**

Run: `node --test cloudbase/admin/food-images.test.mjs`

Expected: PASS。

- [ ] **Step 5: 提交审核台改动。**

Run: `git add cloudbase/admin/food-images.html cloudbase/admin/food-images.test.mjs && git commit -m "feat: control category image batches from review console"`

## Task 7: 全量验证与部署准备

**Files:**
- Modify: `docs/FOOD_IMAGE_GENERATION.md`

- [ ] **Step 1: 写部署运行手册。**

记录以下配置，不写入任何真实值：

```text
get-login-ticket: FOOD_IMAGE_DISPATCH_SECRET=<long-random-secret>
food-image-batch-dispatcher: FOOD_IMAGE_DISPATCH_API_BASE_URL=<main-function-base-url>
food-image-batch-dispatcher: FOOD_IMAGE_DISPATCH_SECRET=<same-long-random-secret>
timer: every 1 minute
```

注明先执行 `0018_food_image_batch_dispatch.sql`，再部署主函数和调度函数，最后在 CloudBase 控制台为调度函数创建每分钟触发器。明确调度函数无公开访问入口。

- [ ] **Step 2: 运行全量自动验证。**

Run:

```bash
node --test \
  scripts/cloudbase/verify-schema.test.mjs \
  cloudbase/admin/food-images.test.mjs \
  cloudbase/functions/get-login-ticket/food-image-dispatch-auth.test.mjs \
  cloudbase/functions/get-login-ticket/food-image-batch-service.test.mjs \
  cloudbase/functions/get-login-ticket/food-image-job-service.test.mjs \
  cloudbase/functions/get-login-ticket/food-image-prompts.test.mjs \
  cloudbase/functions/get-login-ticket/food-repository.test.mjs \
  cloudbase/functions/get-login-ticket/index.test.mjs \
  cloudbase/functions/food-image-batch-dispatcher/index.test.mjs
node --check cloudbase/functions/get-login-ticket/index.js
node --check cloudbase/functions/food-image-batch-dispatcher/index.js
git diff --check
```

Expected: 全部 PASS、两个 Node 语法检查无输出、`git diff --check` 无输出。

- [ ] **Step 3: 做真实 20 条验收，但不自动部署。**

部署获得明确确认后：选择一个分类创建 20 条草稿，启动后关闭审核页至少两分钟，再重新打开确认 `generating` 或 `needs_review` 数量变化；通过一张、拒绝一张，确认拒绝项进入 `needs_retry` 且下一轮提示词包含原因；最后在小程序食物详情确认通过图显示。

- [ ] **Step 4: 提交文档。**

Run: `git add docs/FOOD_IMAGE_GENERATION.md && git commit -m "docs: operate cloud scheduled image batches"`

## 计划自检

- 设计中的单分类、无主图选择、1--100 数量、单候选、三次重试、云端调度、暂停取消、审核同步和固定右侧审核面板均分别由 Task 1--7 覆盖。
- 所有数据库变更使用新迁移，避免修改已部署的 `0017`。
- 计划不接受浏览器传入 food ID，也不让浏览器持有调度密钥。
- 计划包含无管理员会话的签名内部调度路径；任何普通管理接口仍保留现有会话和管理员校验。
