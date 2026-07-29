# 食物库批量生图 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在主环境建立可筛选、可暂停、可恢复、带自动质检的批量食物生图系统，并保持现有单食物生图、人工审核和远程混元 Worker 边界不变。

**Architecture:** 新增批次表和批次项表，由独立的批次服务负责筛选、锁定、生命周期和统计；现有图片任务服务继续负责单个食物的生成、下载、上传和候选记录。新增图片质检服务负责确定性检查和视觉模型评分，批次 Worker 通过小批量 claim 调用单任务执行器，最终仍由管理员确认主图。

**Tech Stack:** CloudBase HTTP 云函数 `get-login-ticket`、CloudBase PostgreSQL、Node.js CommonJS 服务、Node `node:test`、现有 Hunyuan Worker、现有 Qwen/VITA 视觉适配器、现有静态管理页 `cloudbase/admin/food-images.html`。

---

## 文件范围

### 新建

- `cloudbase/pg/migrations/0017_food_image_batches.sql`：批次与批次项表、约束、索引和 server-only RLS。
- `cloudbase/functions/get-login-ticket/food-image-batch-service.cjs`：筛选预览、CSV 匹配、批次创建、生命周期、claim、统计和批次 Worker 编排。
- `cloudbase/functions/get-login-ticket/food-image-batch-service.test.mjs`：批次服务单元测试。
- `cloudbase/functions/get-login-ticket/food-image-quality-service.cjs`：图片格式检查、视觉评分归一化、判定和重试提示词。
- `cloudbase/functions/get-login-ticket/food-image-quality-service.test.mjs`：质检规则单元测试。

### 修改

- `cloudbase/functions/get-login-ticket/food-image-job-service.cjs`：抽出可复用的单任务执行器，接入质检，支持不触发异步 Worker 的内部创建和并发消费。
- `cloudbase/functions/get-login-ticket/food-image-job-service.test.mjs`：覆盖质检结果、重试、并发消费和重复执行。
- `cloudbase/functions/get-login-ticket/index.js`：初始化批次/质检服务，注册批次路由，保持管理员鉴权和现有单任务路由。
- `cloudbase/functions/get-login-ticket/index.test.mjs`：新增批次接口、鉴权、状态变更和错误码测试。
- `cloudbase/functions/get-login-ticket/qwen-vision-service.cjs`：增加专用食物图片质检请求适配器，不改变现有餐食识别 JSON 合约。
- `cloudbase/functions/get-login-ticket/qwen-vision-service.test.mjs`：增加食物主体、风格分数和问题码解析测试。
- `cloudbase/admin/food-images.html`：增加筛选预览、全选/排除、CSV 导入、批次启动/暂停/继续、进度和异常列表。
- `docs/FOOD_IMAGE_GENERATION.md`：补充批次接口、质检阈值、迁移和运行操作。

### 不修改

- `mini-program/`：小程序不参与管理批量生图。
- `cloudbase/functions/hunyuan-image-worker/`：只复用现有 HMAC Worker，不改变其职责。
- 登录、主数据库环境和现有远程 Worker 鉴权配置。

## Task 1: 添加批次数据库结构

**Files:**
- Create: `cloudbase/pg/migrations/0017_food_image_batches.sql`
- Test: `scripts/cloudbase/verify-schema.test.mjs`（只在已有 schema 校验模式允许时补充表名断言）

- [ ] **Step 1: Write the migration with explicit status constraints.**

创建 `food_image_batches` 和 `food_image_batch_items`，并使用以下核心结构：

```sql
create table if not exists public.food_image_batches (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  status text not null default 'draft'
    check (status in ('draft','running','paused','completed','completed_with_errors','cancelled')),
  selection_json jsonb not null default '{}'::jsonb,
  candidate_count integer not null default 1 check (candidate_count = 1),
  max_attempts integer not null default 3 check (max_attempts between 1 and 3),
  concurrency integer not null default 3 check (concurrency between 1 and 5),
  total_count integer not null default 0 check (total_count >= 0),
  pending_count integer not null default 0 check (pending_count >= 0),
  generating_count integer not null default 0 check (generating_count >= 0),
  review_count integer not null default 0 check (review_count >= 0),
  retry_count integer not null default 0 check (retry_count >= 0),
  failed_count integer not null default 0 check (failed_count >= 0),
  completed_count integer not null default 0 check (completed_count >= 0),
  estimated_quota integer not null default 0 check (estimated_quota >= 0),
  consumed_quota integer not null default 0 check (consumed_quota >= 0),
  created_by uuid references public.app_users(id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.food_image_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.food_image_batches(id) on delete cascade,
  food_id uuid not null references public.foods(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','generating','quality_check','needs_retry','needs_review','completed','failed','skipped')),
  job_id uuid references public.food_image_jobs(id) on delete set null,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  last_image_id uuid references public.food_images(id) on delete set null,
  qc_result_json jsonb,
  error_code text,
  error_message text,
  locked_at timestamptz,
  locked_by text,
  next_retry_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id, food_id)
);

create unique index if not exists food_image_batch_items_one_active_food_idx
  on public.food_image_batch_items (food_id)
  where status in ('pending','generating','quality_check','needs_retry');
```

Add indexes for `(batch_id, status, next_retry_at)`, `(batch_id, updated_at desc)`, and `(food_id, created_at desc)`. Add `set_updated_at` triggers and server-only RLS using the same pattern as migration `0013_food_image_generation.sql`.

- [ ] **Step 2: Add the migration to schema verification.**

Extend `scripts/cloudbase/verify-schema.test.mjs` only if its existing assertions enumerate required migrations. Assert that both tables and the active-food partial unique index are present; do not add a live database write to the test.

- [ ] **Step 3: Run the migration static checks.**

Run:

```bash
node --test scripts/cloudbase/verify-schema.test.mjs
git diff --check -- cloudbase/pg/migrations/0017_food_image_batches.sql
```

Expected: all existing schema tests pass and `git diff --check` produces no output.

- [ ] **Step 4: Commit the database boundary.**

```bash
git add cloudbase/pg/migrations/0017_food_image_batches.sql scripts/cloudbase/verify-schema.test.mjs
git commit -m "feat: add food image batch tables"
```

## Task 2: Implement selection, CSV matching, and batch lifecycle

**Files:**
- Create: `cloudbase/functions/get-login-ticket/food-image-batch-service.cjs`
- Create: `cloudbase/functions/get-login-ticket/food-image-batch-service.test.mjs`

- [ ] **Step 1: Define the service contract and normalized filter object.**

Implement these exported functions and constants:

```js
const BATCH_STATUSES = new Set([
  "draft", "running", "paused", "completed", "completed_with_errors", "cancelled",
]);
const ITEM_STATUSES = new Set([
  "pending", "generating", "quality_check", "needs_retry",
  "needs_review", "completed", "failed", "skipped",
]);

function normalizeSelection(input = {}) {
  return {
    imageStatus: ["missing", "has_candidates", "failed", "all"].includes(input.imageStatus)
      ? input.imageStatus : "missing",
    categoryCodes: Array.isArray(input.categoryCodes) ? [...new Set(input.categoryCodes.map(String).filter(Boolean))] : [],
    regionCodes: Array.isArray(input.regionCodes) ? [...new Set(input.regionCodes.map(String).filter(Boolean))] : [],
    query: String(input.query ?? "").trim().slice(0, 80),
    source: input.source ? String(input.source).slice(0, 80) : null,
    limit: Math.min(Math.max(Number(input.limit) || 6000, 1), 6000),
    excludeFoodIds: Array.isArray(input.excludeFoodIds) ? [...new Set(input.excludeFoodIds.filter(Boolean))] : [],
  };
}

function mapBatchRow(row) {
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    selection: row.selection_json ?? {},
    totalCount: Number(row.total_count) || 0,
    pendingCount: Number(row.pending_count) || 0,
    reviewCount: Number(row.review_count) || 0,
    failedCount: Number(row.failed_count) || 0,
    completedCount: Number(row.completed_count) || 0,
    estimatedQuota: Number(row.estimated_quota) || 0,
    consumedQuota: Number(row.consumed_quota) || 0,
    startedAt: row.started_at ?? null,
    finishedAt: row.finished_at ?? null,
  };
}

function mapBatchItemRow(row) {
  return {
    id: row.id,
    batchId: row.batch_id,
    foodId: row.food_id,
    status: row.status,
    jobId: row.job_id ?? null,
    attemptCount: Number(row.attempt_count) || 0,
    lastImageId: row.last_image_id ?? null,
    qcResult: row.qc_result_json ?? null,
    errorCode: row.error_code ?? null,
    errorMessage: row.error_message ?? null,
    nextRetryAt: row.next_retry_at ?? null,
  };
}

function parseFoodCsv(text) {
  const source = String(text ?? "").replace(/^\uFEFF/, "");
  const lines = source.split(/\r?\n/);
  const headers = String(lines.shift() ?? "").split(",").map((value) => value.trim().toLowerCase());
  const foodIdIndex = headers.indexOf("foodid");
  const nameIndex = headers.indexOf("name");
  if (foodIdIndex < 0 && nameIndex < 0) {
    return { rows: [], errors: [{ row: 1, code: "FOOD_IMAGE_BATCH_CSV_INVALID" }] };
  }
  const rows = [];
  const errors = [];
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    const values = line.split(",").map((value) => value.trim());
    const foodId = foodIdIndex >= 0 ? values[foodIdIndex] || null : null;
    const name = nameIndex >= 0 ? values[nameIndex] || null : null;
    if (!foodId && !name) errors.push({ row: index + 2, code: "FOOD_IMAGE_BATCH_CSV_INVALID" });
    else rows.push({ row: index + 2, foodId, name });
  });
  return { rows, errors };
}
```

`parseFoodCsv` must accept the headers `foodId,name` in either order, trim BOM/whitespace, reject empty rows, and never silently discard malformed rows.

- [ ] **Step 2: Write failing tests for selection and CSV behavior.**

Add tests for:

```js
test("normalizeSelection defaults to missing images and caps selection at 6000", () => {
  const selection = normalizeSelection({ imageStatus: "unknown", limit: 9000 });
  assert.equal(selection.imageStatus, "missing");
  assert.equal(selection.limit, 6000);
});

test("parseFoodCsv reports duplicate names and invalid rows without guessing", () => {
  const result = parseFoodCsv("foodId,name\nfood-1,鸡胸肉\n,牛肉\nfood-1,重复");
  assert.equal(result.rows.length, 2);
  assert.equal(result.errors[0].row, 3);
  assert.equal(result.errors[1].row, 4);
});
```

Add fake-db tests for `preview` proving that `imageStatus=missing` adds `foods.image_status = missing`, `categoryCodes` resolves category IDs, and `regionCodes` uses `food_region_memberships` rather than treating regional categories as ordinary category IDs.

- [ ] **Step 3: Implement server-side preview and exact selection.**

Implement:

```js
createFoodImageBatchService({ db, repository, jobs, config })
```

with methods:

- `preview(userId, selection, page, pageSize)` — require admin, query only active/published primary variants, return paginated rows plus total and `hasMore`;
- `resolveSelection(userId, { selection, foodIds, excludeFoodIds })` — re-query on the server, apply exclusions, remove foods with an approved primary or active image task when `onlyMissing=true`, and return actual `foodIds`;
- `importPreview(userId, csvText)` — resolve IDs directly and resolve names only when exactly one published food matches; return `matches`, `ambiguous`, `notFound`, and `invalidRows`;
- `create(userId, payload)` — normalize `candidateCount=1`, `maxAttempts` 1–3, `concurrency` 1–5, insert one batch and its items, set `estimated_quota = itemCount * maxAttempts`, and return the batch summary;
- `get(userId, batchId, page, pageSize)` — return batch summary and paginated items;
- `list(userId, page, pageSize)` — return newest batches first with server pagination;
- `approveBatch(userId, batchId, imageIds)` — verify passing candidates and delegate final primary-image approval;
- `start`, `pause`, `resume`, `cancel`, `retryFailed` — enforce explicit state transitions and update only allowed item states.

The server must insert `food_image_batch_items` one at a time or in bounded chunks, catch the partial unique conflict for an already-active food, mark it `skipped`, and keep the batch summary consistent. It must never accept a client-supplied model name or write a name as `food_id`.

- [ ] **Step 4: Add lifecycle tests before route wiring.**

Cover these transitions:

```js
test("start moves draft batch to running and records startedAt", async () => {
  const result = await service.start("admin", "batch-1");
  assert.equal(result.status, "running");
  assert.ok(result.startedAt);
});
test("pause prevents new claims but does not cancel completed items", async () => {
  const result = await service.pause("admin", "batch-1");
  assert.equal(result.status, "paused");
  assert.equal(result.completedCount, 1);
});
test("resume rejects a completed batch", async () => {
  await assert.rejects(
    () => service.resume("admin", "completed-batch"),
    (error) => error.code === "FOOD_IMAGE_BATCH_STATE_INVALID",
  );
});
test("create persists the supplied foodId and never the display name", async () => {
  const result = await service.create("admin", { foodIds: ["food-1"], name: "样本批次" });
  assert.deepEqual(insertedItems[0], { batch_id: result.id, food_id: "food-1" });
  assert.equal(insertedItems[0].name, undefined);
});
test("active-food conflict becomes skipped instead of duplicating work", async () => {
  const result = await service.create("admin", { foodIds: ["active-food"], name: "重复任务" });
  assert.equal(result.skippedCount, 1);
});
```

The tests must assert error codes `FOOD_IMAGE_BATCH_NOT_FOUND`, `FOOD_IMAGE_BATCH_STATE_INVALID`, `FOOD_IMAGE_BATCH_SELECTION_EMPTY`, `FOOD_IMAGE_BATCH_CSV_INVALID`, and `FOOD_IMAGE_BATCH_CSV_AMBIGUOUS`.

- [ ] **Step 5: Run the isolated batch service tests.**

```bash
cd cloudbase/functions/get-login-ticket
node --test food-image-batch-service.test.mjs
```

Expected: PASS for normalization, preview, CSV matching, creation, state transitions, and duplicate protection.

## Task 3: Add deterministic and visual image quality checks

**Files:**
- Create: `cloudbase/functions/get-login-ticket/food-image-quality-service.cjs`
- Create: `cloudbase/functions/get-login-ticket/food-image-quality-service.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/qwen-vision-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/qwen-vision-service.test.mjs`

- [ ] **Step 1: Define the normalized quality result.**

Implement the injected evaluator contract:

```js
function createFoodImageQualityService({ evaluateVision, matchThreshold = 90, styleThreshold = 80 } = {}) {
  return {
    async inspect({ food, buffer, mimeType, width, height, contentHash, detailUrl, existingHashes = [] }) {
      const deterministic = inspectDeterministic({ buffer, mimeType, width, height, contentHash, detailUrl, existingHashes });
      if (deterministic.decision === "fail") return deterministic;
      const vision = await evaluateVision({ food, imageUrl: detailUrl });
      return decideQuality({ deterministic, vision, matchThreshold, styleThreshold });
    },
  };
}
```

The deterministic result must reject invalid MIME, empty/oversized data, undecodable images, missing dimensions, non-4:3 output, duplicate `contentHash`, missing `storage_path`, and inaccessible CDN-derived image variants. The 4:3 check accepts an absolute ratio error of at most `0.03`.

The normalized vision result must contain:

```js
{
  foodMatchScore: 0,
  styleScore: 0,
  qualityScore: 0,
  issueCodes: [],
  rejectReason: null,
  decision: "pass" // pass | retry | fail
}
```

Use `pass` for match >= 90 and style >= 80, `retry` for match 70–89 without a hard issue, and `fail` for match < 70 or a hard issue. Deterministic hard failures are `fail`; transient vision errors are `retry`.

- [ ] **Step 2: Write failing tests for the three decisions.**

Add tests for a valid 1024×768 image, a 16:9 image, a duplicate hash, a score of `{foodMatchScore: 95, styleScore: 82}`, a retry score of `{foodMatchScore: 78, styleScore: 75}`, and a hard issue `contains_text`.

Expected assertions:

```js
assert.equal(valid.decision, "pass");
assert.equal(wrongRatio.decision, "fail");
assert.equal(retry.decision, "retry");
assert.deepEqual(hardIssue.issueCodes, ["contains_text"]);
```

- [ ] **Step 3: Add a dedicated Qwen food-image evaluator.**

Extend `qwen-vision-service.cjs` with `createQwenFoodImageQualityService`, using the same DashScope endpoint and credentials but a separate prompt that requires JSON:

```json
{
  "foodMatchScore": 0,
  "styleScore": 0,
  "qualityScore": 0,
  "issueCodes": [],
  "reason": ""
}
```

The prompt must include the canonical Chinese food name, category, and explicit negative requirements. Validate all scores to 0–100, limit `issueCodes` to the supported codes `wrong_subject`, `multiple_foods`, `contains_text`, `contains_packaging`, `contains_hand`, `illustration_or_3d`, `unclear_subject`, and cap the reason at 500 characters. Keep `createQwenVisionService` and its existing meal recognition output unchanged.

- [ ] **Step 4: Test Qwen parsing and retryable provider failures.**

Add tests for fenced JSON, invalid scores, unknown issue codes, and HTTP 429/5xx mapping to `VISION_RETRYABLE`. Run:

```bash
cd cloudbase/functions/get-login-ticket
node --test food-image-quality-service.test.mjs qwen-vision-service.test.mjs
```

## Task 4: Refactor the single-image job executor and connect quality results

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/food-image-job-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/food-image-job-service.test.mjs`

- [ ] **Step 1: Add internal job creation and single-job execution seams.**

Change `createJob` to accept internal options without weakening admin checks:

```js
createJob(userId, {
  foodId,
  candidateCount: 1,
  force: false,
  triggerWorker: true,
  maxAttempts,
})
```

`triggerWorker=false` is only used by the batch service after it has already claimed a batch item. Expose `processOne(jobId)` for trusted in-function use; it must re-read the row and refuse non-`pending`/`processing` jobs. Keep `processQueue(userId, { jobId, batchId })` as the HTTP entry point.

- [ ] **Step 2: Inject quality service and preserve quota semantics.**

Pass `quality` into `createFoodImageJobService`. Count every successful Hunyuan invocation in `food_image_usage_daily`, including a candidate later rejected by quality control. Increment `food_image_jobs.generated_count` only when a candidate is successfully persisted and accepted for review. A rejected candidate is stored with `review_status='rejected'`, so a retry cannot accidentally become the primary image.

- [ ] **Step 3: Implement the quality decision path in `processJobRow`.**

After `persistGeneratedImage` and before inserting a pending candidate, call:

```js
const qualityResult = await quality.inspect({
  food,
  buffer: downloaded.buffer,
  mimeType: downloaded.mimeType,
  width: persisted.width,
  height: persisted.height,
  contentHash: persisted.contentHash,
  detailUrl: persisted.detailUrl,
  existingHashes: await listFoodImageHashes(food.id),
});
```

Persist `food_match_score`, `style_score`, `quality_score`, and `reject_reason`. For `pass`, insert a pending Hunyuan candidate and return `{ generated: 1, needsReview: true }`. For `retry`, insert a rejected candidate, append the targeted issue text to the next prompt, set the job back to `pending` when `attemptCount < maxAttempts`, and return `{ generated: 0, needsRetry: true }`. For `fail`, insert a rejected candidate when available, set the job and food to failed, and return `{ failed: true }`.

When `approveImage` succeeds and the approved image has a `job_id`, also update the matching `food_image_batch_items.job_id` row to `completed`, clear its lock, and recalculate the parent batch status. A rejected image sets the item to `failed` only when no retry remains.

- [ ] **Step 4: Make queue consumption bounded and resumable.**

Keep the configured default at 3 and maximum at 5. Claim rows with conditional updates (`where status = pending`) and process the successfully claimed rows with `Promise.all`; do not process the claimed array in a serial loop. On a stale `processing` row older than the configured lease, return it to `pending` before claiming. Do not change the existing one-active-job partial unique index.

- [ ] **Step 5: Add regression tests for job behavior.**

Add tests that assert:

- quality pass creates one pending candidate and moves the job to `reviewing`;
- quality retry creates a rejected candidate, keeps the job retryable, and increments quota once;
- quality hard fail moves the job to `failed`;
- duplicate `processOne` calls do not create duplicate candidates;
- three claimed jobs are processed concurrently by observing overlapping fake promises;
- a single-job request with `triggerWorker=false` does not fire the existing trigger callback.

Run:

```bash
cd cloudbase/functions/get-login-ticket
node --test food-image-job-service.test.mjs
```

## Task 5: Implement batch Worker orchestration and statistics

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/food-image-batch-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/food-image-batch-service.test.mjs`

- [ ] **Step 1: Implement conditional item claim.**

`claimItems(batchId, workerId, limit)` must select only `pending` and due `needs_retry` items from a `running` batch, then update each row with `status='generating'`, `locked_by`, `locked_at`, `attempt_count + 1`, and a conditional `where status in (...)`. Only rows returned by the conditional update may be processed.

- [ ] **Step 2: Connect item status to single-job results.**

For each claimed item:

1. Call `jobs.createJob(adminUserId, { foodId, candidateCount: 1, maxAttempts, triggerWorker: false })`.
2. Save the job ID on the item.
3. Call `jobs.processOne(jobId)`.
4. Map `needsReview` to `needs_review`, `needsRetry` to `needs_retry` with `next_retry_at`, failure to `failed`, and approved-by-human later to `completed`.
5. Recalculate batch counters from item rows after each worker group, not by trusting client counters.

`runWorker(userId, { batchId })` must process at most the batch concurrency and return `{ processed, results, batch }`. A paused or cancelled batch returns zero new claims.

`approveBatch(userId, batchId, imageIds)` must require an explicit non-empty image ID list, verify every image belongs to the batch and has a passing QC result, call the existing single-image approval logic, and return approved and rejected IDs separately. It must never approve an image whose `food_match_score` is below 90 or whose `style_score` is below 80.

- [ ] **Step 3: Implement timeout recovery and terminal status.**

Before claiming, reset `generating`/`quality_check` items whose `locked_at` is older than `FOOD_IMAGE_BATCH_LEASE_MS` (default 15 minutes) to `needs_retry` when attempts remain, otherwise `failed`. Set `completed` only when no items remain in `pending`, `generating`, `quality_check`, `needs_retry`, or `needs_review`; use `completed_with_errors` when failed or review items remain.

- [ ] **Step 4: Add worker and counter tests.**

Cover paused batches, active-food conflicts, lease recovery, retry exhaustion, terminal status with `needs_review`, terminal status after human completion, and quota estimate versus actual invocation count.

## Task 6: Wire HTTP routes and admin authentication

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Modify: `cloudbase/functions/get-login-ticket/index.test.mjs`

- [ ] **Step 1: Initialize the new services.**

Create quality service only when `QWEN_API_KEY`, `DASHSCOPE_API_KEY`, or the existing VITA configuration is available. Pass it into the image job service. Initialize the batch service after `foodImageJobs` exists, passing the same admin repository and job executor. Add environment-backed settings:

```js
batch: {
  concurrency: Math.min(Math.max(Number(env.HY_IMAGE_BATCH_CONCURRENCY) || 3, 1), 5),
  leaseMs: Math.max(Number(env.HY_IMAGE_BATCH_LEASE_MS) || 900000, 60000),
  maxAttempts: Math.min(Math.max(Number(env.HY_IMAGE_BATCH_MAX_ATTEMPTS) || 3, 1), 3),
}
```

When no vision provider is configured, deterministic checks still run and the item goes to `needs_review` rather than being silently auto-approved.

- [ ] **Step 2: Add route parsing.**

Extend `getAdminFoodRoute` with these exact operations:

```js
GET  /food-image-batches/preview
POST /food-image-batches
POST /food-image-batches/import
GET  /food-image-batches
GET  /food-image-batches/:id
POST /food-image-batches/:id/start
POST /food-image-batches/:id/pause
POST /food-image-batches/:id/resume
POST /food-image-batches/:id/cancel
POST /food-image-batches/:id/retry-failed
POST /food-image-batches/:id/approve
```

Use the existing UUID route validation and ensure the dynamic `:id` matcher is evaluated after the fixed `/preview` and `/import` routes.

- [ ] **Step 3: Add handler methods with existing error mapping.**

Every handler must verify the product session, then call the batch service method with `session.sub`. Map `FoodImageBatchError` to 401/403/400 exactly as the existing `FoodImageJobError` mapping. Keep `/food-image-jobs/batch` as a backward-compatible explicit-ID wrapper that creates a draft/running batch through the new service.

- [ ] **Step 4: Add HTTP contract tests.**

Add tests for unauthenticated 401, non-admin 403, preview query parameters, CSV import response, draft creation, start/pause/resume/cancel, UUID route parsing, and invalid transition 400. Use a mocked `foodImageBatches` service so the tests do not invoke Hunyuan.

Run:

```bash
cd cloudbase/functions/get-login-ticket
node --test index.test.mjs
```

## Task 7: Replace the minimal admin page with a batch control page

**Files:**
- Modify: `cloudbase/admin/food-images.html`

- [ ] **Step 1: Add the selection controls.**

Add controls for image status, category code, region code, name query, source, page size, preview, CSV text/file input, “全选当前筛选结果”, and an exclusion list. The page must display paginated preview rows with `foodId`, Chinese name, English name, category, region, and current image state.

- [ ] **Step 2: Add batch confirmation and lifecycle controls.**

On create, show total food count, skipped count, estimated quota, and category/region summary before calling `POST /food-image-batches`. Add start, pause, resume, cancel, retry failed, refresh progress, and show exceptions grouped by `errorCode`/`issueCodes`.

- [ ] **Step 3: Preserve the existing single-job controls.**

Keep the existing single `foodId` smoke-test form, diagnose button, candidate preview, approve, and reject actions. Put it below the batch panel and label it “单食物冒烟/异常重试”, so the bulk workflow is the default path without removing the proven diagnostic tools.

- [ ] **Step 4: Manually verify the management page.**

Open the HTML against a local mocked API or the deployed main function and verify that selecting all filtered results does not fetch all 6,000 rows into the DOM, CSV ambiguous names are shown as errors, and pausing a batch disables only the start/continue action while preserving review controls.

## Task 8: Update documentation, run the full validation, and prepare staged rollout

**Files:**
- Modify: `docs/FOOD_IMAGE_GENERATION.md`
- Modify: `.env.example` only if the project already documents CloudBase function-only variables there

- [ ] **Step 1: Document the new endpoints and environment variables.**

Add the batch API table, status meanings, CSV schema, quality thresholds, lease recovery, quota accounting, and the following variables:

```text
HY_IMAGE_BATCH_CONCURRENCY=3
HY_IMAGE_BATCH_LEASE_MS=900000
HY_IMAGE_BATCH_MAX_ATTEMPTS=3
HY_IMAGE_QC_ENABLED=true
```

State clearly that the first run is 10–20 sample foods, then 100–300 item category batches, and only after review acceptance expand toward the full catalog.

- [ ] **Step 2: Run all CloudBase function tests.**

```bash
cd cloudbase/functions/get-login-ticket
npm test
```

Expected: all existing and new Node tests pass.

- [ ] **Step 3: Run static schema and formatting checks.**

```bash
cd /Users/lewis/Documents/Nordic-Nutri-AI
node --test scripts/cloudbase/verify-schema.test.mjs
git diff --check
```

Expected: schema assertions pass and no whitespace errors are reported. Existing unrelated user modifications must remain unstaged.

- [ ] **Step 4: Perform the staged runtime acceptance.**

Against the main environment, create a 10–20 item draft from `imageStatus=missing`, confirm the preview count, start it, invoke the Worker, inspect generated candidates and QC scores, approve one candidate, pause/resume once, and force one fake retry using a test fixture. Verify every generated candidate has a valid `storage_path`, the API-resolved thumbnail/list/detail CDN variants return the expected HTTP status and MIME type, the new URL fields remain null, and no temporary Hunyuan host is stored in `food_images.source_url` or API responses.

- [ ] **Step 5: Deploy only after runtime acceptance.**

Apply migration `0017_food_image_batches.sql`, deploy the main `get-login-ticket` function, keep the existing remote Worker unchanged, and verify the admin API with the same 10–20 item sample before expanding the batch size.

## Self-review checklist

- [ ] Every confirmed design section has a plan task: server-side selection/CSV (Task 2), batch data model (Task 1), resumable execution (Tasks 4–5), automatic QC (Task 3–4), API and admin controls (Tasks 6–7), quota and staged rollout (Task 8).
- [ ] No step accepts a food name as the persisted task identity; all writes use `food_id`.
- [ ] No step auto-sets `foods.primary_image_id`; human approval remains required.
- [ ] The 100,000 quota assumption is used only for planning estimates; actual usage is read from `food_image_usage_daily` and the CloudBase console.
- [ ] The migration keeps server-only RLS and the existing single-job partial unique index.
- [ ] The plan does not modify the mini program or the remote HMAC Worker.
- [ ] Test commands are exact and separate static evidence from live runtime acceptance.
