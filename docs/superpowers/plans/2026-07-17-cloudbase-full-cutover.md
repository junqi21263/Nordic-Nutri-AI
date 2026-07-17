# CloudBase 全量后端切换 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Nordic Nutri AI 的真实后端、身份、数据、文件和小程序运行时从 Supabase 完整迁移到 `lewis-healthy-d4glgqqzv73a5bc10`，并在验收后删除所有 Supabase 运行时依赖。

**Architecture:** Taro 页面与领域 Store 保持不变，小程序只通过 `wx.cloud.callFunction` 调用 CloudBase 事件云函数。云函数以 CloudBase `uid` 为调用者身份、以可信 OPENID 做一次性历史账户匹配，并在 CloudBase PostgreSQL 中执行带 owner 限制的读写和原子事务；Supabase 只在一次性加密导出和校验窗口中作为源端。

**Tech Stack:** Taro 4、React 18、TypeScript、Zustand、Vitest、CloudBase Event Functions（Nodejs18.15）、`wx-server-sdk`、`@cloudbase/node-sdk`、CloudBase PostgreSQL、CloudBase Storage、CloudBase MCP。

---

## 固定约束

- 目标环境只能使用 `lewis-healthy-d4glgqqzv73a5bc10`；每一个 CloudBase MCP 调用显式带入该 EnvId。
- 新业务数据只能写入 CloudBase PostgreSQL；不得把关系型餐食、档案、目标或计划迁到 NoSQL。
- `uid` 是运行时授权身份，OPENID 只在云函数内用于一次性历史账户匹配；客户端不得提交这两个字段。
- 不做长期双写。切换窗口冻结 Supabase 写入，CloudBase 通过校验后才发布新小程序。
- 任何切换前的 Supabase 数据导出、身份哈希和文件清单均是敏感数据，不进入 Git、日志或小程序产物。

## 文件结构

| 路径 | 责任 |
| --- | --- |
| `cloudbase/pg/migrations/0001_core_schema.sql` | 应用用户、资料、设置、档案、目标、计划、食品目录、AI、餐食、教练和审计表 |
| `cloudbase/pg/migrations/0002_meal_atomic.sql` | 餐食总量触发器、`save_meal_atomic`、`update_meal_atomic`、活动餐食 view |
| `cloudbase/pg/migrations/0003_permissions.sql` | Schema/table 权限、RLS、私有身份映射表和存储对象策略 |
| `cloudbase/functions/_shared/*` | 云函数响应、身份解析、输入验证、数据库网关和 requestId |
| `cloudbase/functions/bootstrap-user/` | 新建或绑定当前用户，返回首登状态 |
| `cloudbase/functions/profile-service/` | Profile、Settings、Body Profile 与 Goal 操作 |
| `cloudbase/functions/meal-service/` | 餐食查询、原子创建/编辑、归档与恢复 |
| `cloudbase/functions/asset-service/` | 私有图片上传、下载授权与资产元数据 |
| `cloudbase/functions/migration-admin/` | 仅运维调用的导入校验和身份绑定任务 |
| `scripts/cloudbase/*` | 无密钥的迁移清单、校验和、导入/回退操作脚本 |
| `mini-program/src/lib/cloudbase.ts` | 小程序 `wx.cloud` 初始化与统一函数调用 |
| `mini-program/src/api/cloudbase-api.ts` | 从领域输入映射到云函数 action 的客户端 API |
| `mini-program/src/auth/cloudbase-session-manager.ts` | 产品级 bootstrap 与本地退出清理，不保存 Supabase Session |
| `mini-program/tests/cloudbase-*.test.ts` | CloudBase 调用、身份启动、资料与餐食 Repository 回归 |

### Task 1: 初始化目标 PostgreSQL 并记录空库基线

**Files:**
- Create: `scripts/cloudbase/record-pg-baseline.mjs`
- Create: `docs/cloudbase/2026-07-17-pg-baseline.json`（仅对象名和计数，不含业务数据）
- Test: `scripts/cloudbase/record-pg-baseline.test.mjs`

- [ ] **Step 1: 写失败测试，要求基线记录必须包含 EnvId、RuntimeMode、对象数组和生成时间。**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { validatePgBaseline } from "./record-pg-baseline.mjs";

test("validates a PostgreSQL baseline", () => {
  assert.equal(validatePgBaseline({
    envId: "lewis-healthy-d4glgqqzv73a5bc10",
    runtimeMode: "postgresql",
    capturedAt: "2026-07-17T00:00:00.000Z",
    objects: [],
  }), true);
});
```

- [ ] **Step 2: 运行测试并确认因 `validatePgBaseline` 尚不存在而失败。**

Run: `node --test scripts/cloudbase/record-pg-baseline.test.mjs`

Expected: `ERR_MODULE_NOT_FOUND` 或 `validatePgBaseline is not a function`。

- [ ] **Step 3: 实现纯校验函数，并通过 MCP 初始化/读取 PG 上下文。**

```js
export function validatePgBaseline(value) {
  return value?.envId === "lewis-healthy-d4glgqqzv73a5bc10"
    && value?.runtimeMode === "postgresql"
    && typeof value?.capturedAt === "string"
    && Array.isArray(value?.objects);
}
```

Run, in order:

```bash
npx mcporter call cloudbase.managePgDatabase --args '{"action":"init","envId":"lewis-healthy-d4glgqqzv73a5bc10","defaultSchema":"public"}' --output json
npx mcporter call cloudbase.queryPgDatabase --args '{"action":"objects","schema":"public","limit":200}' --output json
```

Save only `envId`、`runtimeMode`、`capturedAt`、对象名和对象类型到基线 JSON；不得保存任何行内容。

- [ ] **Step 4: 复跑测试与只读环境检查。**

Run: `node --test scripts/cloudbase/record-pg-baseline.test.mjs`

Expected: PASS；`queryPgDatabase` 返回 PG 上下文，不创建应用表。

- [ ] **Step 5: 提交。**

```bash
git add scripts/cloudbase docs/cloudbase
git commit -m "chore: record CloudBase PG baseline"
```

### Task 2: 确认云函数访问 CloudBase PG 的受支持运行时边界

**Files:**
- Create: `cloudbase/functions/_shared/pg-runtime.js`
- Create: `cloudbase/functions/_shared/pg-runtime.test.mjs`
- Create: `cloudbase/functions/pg-capability-probe/index.js`
- Create: `cloudbase/functions/pg-capability-probe/package.json`

- [ ] **Step 1: 写失败测试，拒绝没有 `query` 与 `transaction` 两个能力的 PG 适配器。**

```js
import test from "node:test";
import assert from "node:assert/strict";
import { assertPgGateway } from "./pg-runtime.js";

test("rejects an incomplete PostgreSQL gateway", () => {
  assert.throws(() => assertPgGateway({ query() {} }), /transaction/);
});
```

- [ ] **Step 2: 运行测试确认失败。**

Run: `node --test cloudbase/functions/_shared/pg-runtime.test.mjs`

Expected: 模块不存在。

- [ ] **Step 3: 实现网关断言，并部署只读 capability probe。**

```js
export function assertPgGateway(gateway) {
  if (typeof gateway?.query !== "function") throw new Error("CloudBase PG query capability is required");
  if (typeof gateway?.transaction !== "function") throw new Error("CloudBase PG transaction capability is required");
  return gateway;
}
```

`pg-capability-probe` 必须只执行 `SELECT 1 AS ok`，返回 `{ success: true, data: { pg: true }, requestId }`；实现时依据已安装 `@cloudbase/node-sdk` 的实际 API，不得猜测 HTTP URL 或把管理 API Key 放入函数代码。

Deploy with `manageFunctions(action="createFunction")`、`type="Event"`、`runtime="Nodejs18.15"`、`functionRootPath` 指向 `cloudbase/functions`。调用一次并读取函数日志，确认函数运行时具有真实 PG 查询和事务能力后才开始任何业务函数。

- [ ] **Step 4: 运行测试和线上只读探针。**

Run: `node --test cloudbase/functions/_shared/pg-runtime.test.mjs`

Expected: PASS；probe 返回 `pg: true`，不出现管理密钥、SQL 连接串或用户数据。

- [ ] **Step 5: 提交。**

```bash
git add cloudbase/functions
git commit -m "feat: verify CloudBase PG function runtime"
```

### Task 3: 迁移完整 PostgreSQL Schema、约束和原子餐食逻辑

**Files:**
- Create: `cloudbase/pg/migrations/0001_core_schema.sql`
- Create: `cloudbase/pg/migrations/0002_meal_atomic.sql`
- Create: `cloudbase/pg/migrations/0003_permissions.sql`
- Create: `scripts/cloudbase/verify-schema.mjs`
- Test: `scripts/cloudbase/verify-schema.test.mjs`

- [ ] **Step 1: 写失败测试，要求核心表、原子函数和 private identity 表全部存在。**

```js
const requiredObjects = [
  "public.app_users", "public.profiles", "public.user_settings", "public.body_profiles",
  "public.user_goals", "public.nutrition_plans", "public.health_plan_items",
  "public.food_catalog", "public.uploaded_assets", "public.ai_analysis",
  "public.meal_records", "public.meal_items", "public.coach_conversations",
  "public.coach_messages", "private.identity_migrations",
  "public.save_meal_atomic", "public.update_meal_atomic", "public.active_meal_records",
];
```

- [ ] **Step 2: 运行 schema 测试并确认空库缺少这些对象。**

Run: `node --test scripts/cloudbase/verify-schema.test.mjs`

Expected: FAIL，列出缺失对象。

- [ ] **Step 3: 从 `supabase/migrations/0001_initial_schema.sql`、`20260716015243_backend_phase1_foundation.sql`、`20260716021243_backend_phase2_auth_and_meal_closure.sql` 和 `20260716100945_phase3a_meal_atomic_update.sql` 迁移 SQL。**

实施规则：

- `public.users` 改名为 `public.app_users`，主键仍为原 UUID，并新增 `cloudbase_uid varchar(128) unique`。
- `private.identity_migrations` 仅保存 `legacy_supabase_user_id uuid unique`、`legacy_openid_hash char(64) unique`、`bound_user_id uuid unique`、`cloudbase_uid varchar(128) unique null`、`bound_at timestamptz null` 与审计时间。
- 保留所有现有外键、check、partial unique index、`set_updated_at`、current version triggers、meal total trigger、soft delete 和 `client_request_id` 幂等约束。
- `save_meal_atomic(p_actor_id uuid, p_input jsonb)` 与 `update_meal_atomic(p_actor_id uuid, p_input jsonb)` 必须在函数内部验证 `meal_records.user_id = p_actor_id`，不从 JSON 读取 owner。
- `0003_permissions.sql` 对业务表启用 RLS，撤销 `anon`/`authenticated` 的直接业务表访问；函数运行时使用受控服务边界。所有迁移须先用 `managePgDatabase(action="planMigration")` 预演，再用 `applyMigration` 应用。

- [ ] **Step 4: 执行迁移并复跑 schema/权限检查。**

Run:

```bash
npx mcporter call cloudbase.managePgDatabase action=planMigration envId=lewis-healthy-d4glgqqzv73a5bc10 sql=@cloudbase/pg/migrations/0001_core_schema.sql --output json
npx mcporter call cloudbase.managePgDatabase action=planMigration envId=lewis-healthy-d4glgqqzv73a5bc10 sql=@cloudbase/pg/migrations/0002_meal_atomic.sql --output json
npx mcporter call cloudbase.managePgDatabase action=planMigration envId=lewis-healthy-d4glgqqzv73a5bc10 sql=@cloudbase/pg/migrations/0003_permissions.sql --output json
npx mcporter call cloudbase.queryPgDatabase --args '{"action":"objects","schema":"public","limit":200}' --output json
node --test scripts/cloudbase/verify-schema.test.mjs
```

Expected: 所有 required objects 存在；以 `anon` 或 `authenticated` 角色直接读取业务表被拒绝；管理员 schema 查询仍可读元数据。

- [ ] **Step 5: 提交。**

```bash
git add cloudbase/pg scripts/cloudbase
git commit -m "feat: add CloudBase PostgreSQL schema"
```

### Task 4: 实现 CloudBase 用户 bootstrap 与迁移身份绑定

**Files:**
- Create: `cloudbase/functions/_shared/response.js`
- Create: `cloudbase/functions/_shared/identity.js`
- Create: `cloudbase/functions/bootstrap-user/index.js`
- Create: `cloudbase/functions/bootstrap-user/package.json`
- Test: `cloudbase/functions/_shared/identity.test.mjs`
- Test: `cloudbase/functions/bootstrap-user/index.test.mjs`

- [ ] **Step 1: 写失败测试，覆盖新用户、历史用户绑定和不匹配用户绝不合并。**

```js
test("binds a legacy user only when the verified OPENID hash matches", async () => {
  const result = await bootstrap({ uid: "cb-uid", openid: "wx-openid" }, fakeRepository);
  assert.equal(result.userId, "legacy-user-uuid");
  assert.equal(fakeRepository.bindCalls.length, 1);
});

test("creates a separate user when no legacy hash matches", async () => {
  const result = await bootstrap({ uid: "cb-new", openid: "new-openid" }, fakeRepository);
  assert.equal(result.onboardingRequired, true);
});
```

- [ ] **Step 2: 运行测试确认失败。**

Run: `node --test cloudbase/functions/_shared/identity.test.mjs cloudbase/functions/bootstrap-user/index.test.mjs`

Expected: 模块不存在。

- [ ] **Step 3: 实现 bootstrap。**

函数以 `auth.getUserInfo()` 的 `uid` 为主身份，在函数上下文中读取 OPENID 并以部署时注入的 `IDENTITY_HASH_PEPPER` 计算 HMAC-SHA-256。调用顺序固定为：已有 `cloudbase_uid` → 未绑定的 legacy hash → 新建 `app_users`/`profiles`/`user_settings`。返回：

```js
{ success: true, data: { userId, onboardingRequired, profile, settings }, requestId }
```

不得返回 uid、OPENID、哈希、pepper 或内部 migration 记录。

- [ ] **Step 4: 运行单元测试并用真机/开发者工具调用函数。**

Expected: 同一微信用户重复调用返回同一业务 UUID；不同用户不能读到前一用户资料；新用户获得默认 Settings。

- [ ] **Step 5: 提交。**

```bash
git add cloudbase/functions
git commit -m "feat: bootstrap CloudBase users"
```

### Task 5: 实现资料、设置、身体档案和目标服务

**Files:**
- Create: `cloudbase/functions/profile-service/index.js`
- Create: `cloudbase/functions/profile-service/package.json`
- Test: `cloudbase/functions/profile-service/index.test.mjs`

- [ ] **Step 1: 写失败测试，覆盖 actor 限制、资料更新、档案新增版本和目标新增版本。**

```js
test("creates a new current body-profile version without accepting userId from input", async () => {
  const result = await dispatch({ action: "saveBodyProfile", input: validBodyProfile }, actor, repository);
  assert.equal(result.user_id, actor.userId);
  assert.equal(repository.inserted.user_id, actor.userId);
});
```

- [ ] **Step 2: 运行失败测试。**

Run: `node --test cloudbase/functions/profile-service/index.test.mjs`

Expected: FAIL，因为 `dispatch` 尚不存在。

- [ ] **Step 3: 实现 action 白名单。**

允许的 action 是 `getIdentity`、`updateProfile`、`updateSettings`、`saveBodyProfile`、`saveGoal`。所有 action 先解析 actor，再校验字段：年龄 14–80、身高 120–230、体重 30–300、每日餐数 2–5、目标日期晚于当天。`saveBodyProfile` 和 `saveGoal` 仅插入新记录并让数据库 trigger 退役旧 current 记录。

- [ ] **Step 4: 运行测试和函数级权限复验。**

Expected: PASS；传入伪造 `userId` 不影响写入 owner；同一用户仅有一条 current Goal 和 Body Profile。

- [ ] **Step 5: 提交。**

```bash
git add cloudbase/functions/profile-service
git commit -m "feat: add CloudBase profile services"
```

### Task 6: 实现餐食服务与数据库原子事务

**Files:**
- Create: `cloudbase/functions/meal-service/index.js`
- Create: `cloudbase/functions/meal-service/package.json`
- Test: `cloudbase/functions/meal-service/index.test.mjs`
- Test: `scripts/cloudbase/meal-atomic.integration.mjs`

- [ ] **Step 1: 写失败测试，覆盖 create、update、list、archive、restore 和跨用户拒绝。**

```js
test("passes the resolved actor UUID instead of a client owner to save_meal_atomic", async () => {
  await dispatch({ action: "create", input: validMeal }, { userId: "actor-uuid" }, fakePg);
  assert.deepEqual(fakePg.rpcCall, ["save_meal_atomic", "actor-uuid", validMeal]);
});
```

- [ ] **Step 2: 运行失败测试。**

Run: `node --test cloudbase/functions/meal-service/index.test.mjs`

Expected: FAIL，因为 `dispatch` 尚不存在。

- [ ] **Step 3: 实现餐食 action。**

`create` 和 `update` 调用 CloudBase PG 的对应原子函数；`list` 只读取 `deleted_at is null` 的 actor 数据，按日期、餐次、关键词、`recorded_at desc` 和 offset/limit 查询；`archive`/`restore` 使用 `id AND user_id = actorId` 更新。创建请求必须携带 UUID 格式 `clientRequestId`；重试复用相同 ID。

- [ ] **Step 4: 运行单元、数据库集成和小程序餐食回归。**

Run: `node --test cloudbase/functions/meal-service/index.test.mjs scripts/cloudbase/meal-atomic.integration.mjs`

Expected: 任一 item 非法时没有 meal/item 写入；重复 request id 只产生一条餐食；用户 B 修改用户 A 的餐食返回 `FORBIDDEN`。

- [ ] **Step 5: 提交。**

```bash
git add cloudbase/functions/meal-service scripts/cloudbase
git commit -m "feat: add CloudBase meal service"
```

### Task 7: 实现私有资产服务和 PG storage 策略

**Files:**
- Create: `cloudbase/functions/asset-service/index.js`
- Create: `cloudbase/functions/asset-service/package.json`
- Modify: `cloudbase/pg/migrations/0003_permissions.sql`
- Test: `cloudbase/functions/asset-service/index.test.mjs`

- [ ] **Step 1: 写失败测试，要求上传路径由 actor UUID 生成且不能覆盖其他用户对象。**

```js
test("creates an actor-owned private object key", () => {
  assert.match(createObjectKey("actor-uuid", "image/jpeg", "request-uuid"), /^actor-uuid\/\d{4}\/\d{2}\/request-uuid\.jpg$/);
});
```

- [ ] **Step 2: 运行失败测试。**

Run: `node --test cloudbase/functions/asset-service/index.test.mjs`

Expected: FAIL，因为 `createObjectKey` 尚不存在。

- [ ] **Step 3: 创建专用 pgstore bucket，并实现授权操作。**

创建名为 `food-images` 的 pgstore bucket；为 `storage.objects` 应用仅允许受控服务边界访问的策略。`asset-service` 只允许 JPEG/WebP、最大 5 MiB，返回短期上传/下载信息和资产 metadata；上传完成前不写 `uploaded_assets` success 状态。

- [ ] **Step 4: 运行测试和真实上传/下载负向测试。**

Expected: PASS；用户 B 不能获得用户 A 对象的签名 URL；无效 MIME、超限文件和失败上传不创建有效资产记录。

- [ ] **Step 5: 提交。**

```bash
git add cloudbase/functions/asset-service cloudbase/pg
git commit -m "feat: add private CloudBase asset service"
```

### Task 8: 替换小程序运行时配置与 CloudBase 调用层

**Files:**
- Modify: `mini-program/config/index.ts`
- Modify: `mini-program/src/api/environment.ts`
- Create: `mini-program/src/lib/cloudbase.ts`
- Create: `mini-program/src/api/cloudbase-api.ts`
- Test: `mini-program/tests/cloudbase-client.test.ts`

- [ ] **Step 1: 写失败测试，要求真实环境必须使用 CloudBase EnvId 且不能出现 Supabase 配置。**

```ts
expect(getPublicRuntimeConfig()).toMatchObject({
  cloudbaseEnvId: "lewis-healthy-d4glgqqzv73a5bc10",
  useRealBackend: true,
});
expect(getPublicRuntimeConfig()).not.toHaveProperty("supabaseUrl");
```

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm --dir mini-program test:unit -- cloudbase-client.test.ts`

Expected: FAIL，因为当前配置仍含 Supabase 字段。

- [ ] **Step 3: 用最小 CloudBase client 替换配置。**

```ts
export function initializeCloudbase() {
  Taro.cloud.init({ env: getPublicRuntimeConfig().cloudbaseEnvId, traceUser: true });
}

export async function callCloudFunction<T>(name: string, data: Record<string, unknown>) {
  const result = await Taro.cloud.callFunction({ name, data });
  return unwrapCloudbaseResult<T>(result.result);
}
```

仅注入 `TARO_APP_CLOUDBASE_ENV_ID`、`TARO_APP_ENV` 和真实后端开关；删除 `TARO_APP_SUPABASE_URL`、publishable key 与 Supabase URL provider shim。

- [ ] **Step 4: 运行测试、类型检查与微信构建。**

Run:

```bash
pnpm --dir mini-program test:unit -- cloudbase-client.test.ts
pnpm --dir mini-program typecheck
pnpm --dir mini-program build:weapp
```

Expected: PASS；构建产物不含 `supabase.co`、`SUPABASE_` 或 publishable key。

- [ ] **Step 5: 提交。**

```bash
git add mini-program/config mini-program/src/api mini-program/src/lib mini-program/tests
git commit -m "feat: add CloudBase mini program client"
```

### Task 9: 替换认证 bootstrap、产品级退出和 Profile Repository

**Files:**
- Modify: `mini-program/src/auth/auth-store.ts`
- Create: `mini-program/src/auth/cloudbase-session-manager.ts`
- Modify: `mini-program/src/auth/app-auth-bootstrap.ts`
- Modify: `mini-program/src/auth/logout-flow.ts`
- Modify: `mini-program/src/repositories/profile-repository.ts`
- Test: `mini-program/tests/cloudbase-auth-bootstrap.test.ts`
- Test: `mini-program/tests/cloudbase-profile-repository.test.ts`

- [ ] **Step 1: 写失败测试，确认首次点击 bootstrap、退出仅清本地状态、身份读取不传 userId。**

```ts
expect(call).toHaveBeenCalledWith("bootstrap-user", {});
await logout.run();
expect(clearUserState).toHaveBeenCalledOnce();
expect(openLogin).toHaveBeenCalledOnce();
```

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm --dir mini-program test:unit -- cloudbase-auth-bootstrap.test.ts cloudbase-profile-repository.test.ts`

Expected: FAIL，因为现有 Auth Store 依赖 Supabase `Session` 与 `User`。

- [ ] **Step 3: 实现 CloudBase 产品会话。**

将 Auth Store 改为 `{ status, user: { id, onboardingRequired }, clear }`；`startApplicationAuth` 只在首次启动允许一次 bootstrap，用户主动退出后必须由点击登录按钮发起。Profile Repository 调用 `profile-service` action，不再接受、拼接或更新客户端 user ID。

- [ ] **Step 4: 运行登录、退出和 Profile 页面回归。**

Expected: PASS；冷启动、首次用户、已迁移用户、退出后重新点击登录均走 CloudBase；页面不展示 uid、OPENID 或后端错误原文。

- [ ] **Step 5: 提交。**

```bash
git add mini-program/src/auth mini-program/src/repositories mini-program/tests
git commit -m "feat: migrate app auth to CloudBase"
```

### Task 10: 替换 Body Profile、Goal 与 Meal Repositories/Stores/页面调用

**Files:**
- Modify: `mini-program/src/repositories/body-profile-repository.ts`
- Modify: `mini-program/src/repositories/health-goal-repository.ts`
- Modify: `mini-program/src/repositories/meal-repository.ts`
- Modify: `mini-program/src/stores/meal-store.ts`
- Modify: `mini-program/src/pages/body-profile/index.tsx`
- Modify: `mini-program/src/pages/goal-adjust/index.tsx`
- Modify: `mini-program/src/pages/manual-meal/index.tsx`
- Modify: `mini-program/src/pages/meal-records/index.tsx`
- Modify: `mini-program/src/pages/meal-detail/index.tsx`
- Modify: `mini-program/src/pages/portion-adjustment/index.tsx`
- Test: `mini-program/tests/cloudbase-body-goal-repository.test.ts`
- Test: `mini-program/tests/cloudbase-meal-repository.test.ts`

- [ ] **Step 1: 写失败测试，验证 Repository 发出 action payload、没有 owner 字段，并映射既有领域模型。**

```ts
expect(call).toHaveBeenCalledWith("meal-service", {
  action: "create",
  input: expect.objectContaining({ clientRequestId: expect.any(String) }),
});
expect(call.mock.calls[0]?.[1]).not.toHaveProperty("userId");
```

- [ ] **Step 2: 运行失败测试。**

Run: `pnpm --dir mini-program test:unit -- cloudbase-body-goal-repository.test.ts cloudbase-meal-repository.test.ts`

Expected: FAIL，因为 Repository 仍调用 `from` 和 `rpc`。

- [ ] **Step 3: 保留领域 API，改用云函数 action。**

Body Profile 与 Goal 调用 `profile-service`；餐食调用 `meal-service` 的 `create`、`update`、`list`、`archive`、`restore`。保持 `Meal`、`MealItem`、日期筛选、分页、错误空态和 `clientRequestId` 重试语义不变。Store 的远端数据源名称由 `supabase` 改为 `cloudbase`。

- [ ] **Step 4: 运行餐食与页面回归。**

Run:

```bash
pnpm --dir mini-program test:unit -- cloudbase-body-goal-repository.test.ts cloudbase-meal-repository.test.ts meal-store.test.ts meal-detail-interactions.test.ts
pnpm --dir mini-program build:weapp
```

Expected: PASS；所有真实操作只命中 CloudBase 云函数，没有 Supabase 网络请求。

- [ ] **Step 5: 提交。**

```bash
git add mini-program/src/repositories mini-program/src/stores mini-program/src/pages mini-program/tests
git commit -m "feat: route nutrition data through CloudBase"
```

### Task 11: 构建一次性导出、导入和校验链路

**Files:**
- Create: `scripts/cloudbase/export-supabase-manifest.mjs`
- Create: `scripts/cloudbase/import-cloudbase-data.mjs`
- Create: `scripts/cloudbase/verify-import.mjs`
- Create: `scripts/cloudbase/import-contract.test.mjs`
- Create: `docs/cloudbase/data-migration-runbook.md`

- [ ] **Step 1: 写失败测试，要求导入 manifest 不含任何 Secret、Session、明文 OPENID 或二进制图片。**

```js
test("rejects secret-bearing migration manifests", () => {
  assert.throws(() => validateManifest({ tables: [], supabaseServiceRoleKey: "secret" }), /secret/i);
});
```

- [ ] **Step 2: 运行失败测试。**

Run: `node --test scripts/cloudbase/import-contract.test.mjs`

Expected: FAIL，因为 manifest 校验尚不存在。

- [ ] **Step 3: 实现导出/导入契约。**

导出任务只在受控本机或 CI secret 环境运行，生成加密文件外的 manifest：每表行数、按主键排序的 SHA-256、对象键/大小/哈希、身份映射行数和导出时间。导入按外键顺序执行，保留 UUID；导入 `identity_migrations` 时只写旧用户 UUID 与旧 OPENID HMAC。导入脚本在任何计数或校验和不一致时以非零状态退出。

- [ ] **Step 4: 在测试导出快照上运行导入校验。**

Expected: PASS；`verify-import` 比较所有表行数、主键缺失、外键孤儿、每餐 items 汇总与 storage 对象清单。

- [ ] **Step 5: 提交。**

```bash
git add scripts/cloudbase docs/cloudbase
git commit -m "feat: add CloudBase migration verification"
```

### Task 12: 部署、切换、移除 Supabase 与最终验收

**Files:**
- Modify: `mini-program/package.json`
- Modify: `package.json`
- Delete: `supabase/`
- Delete: `mini-program/src/lib/supabase-client.ts`
- Delete: `mini-program/src/lib/supabase-url.ts`
- Delete: `mini-program/src/lib/wechat-fetch.ts`
- Delete: `mini-program/src/lib/wechat-realtime-transport.ts`
- Delete: `mini-program/src/lib/wechat-storage.ts`
- Delete: `mini-program/src/api/supabase-client.ts`
- Delete: `mini-program/src/api/database.types.ts`
- Delete: `mini-program/src/dev/supabase-initialization-probe.ts`
- Modify: `mini-program/src/pages/dev-auth-harness/index.tsx`
- Test: `scripts/cloudbase/no-supabase-runtime.test.mjs`

- [ ] **Step 1: 写失败测试，扫描生产依赖、源代码和构建产物中所有 Supabase runtime 引用。**

```js
const forbidden = ["@supabase/supabase-js", "supabase.co", "SUPABASE_", "functions.invoke", "verifyOtp"];
for (const token of forbidden) assert.equal(scanProductionSources().includes(token), false, token);
```

- [ ] **Step 2: 运行失败测试。**

Run: `node --test scripts/cloudbase/no-supabase-runtime.test.mjs`

Expected: FAIL，列出当前 Supabase 依赖与源码文件。

- [ ] **Step 3: 在完成数据导入和真实联调后执行不可逆清理。**

先用 MCP 部署所有事件函数、应用 PG migrations、配置函数 Secret（`IDENTITY_HASH_PEPPER` 只在函数环境）、验证函数安全规则和 pgstore bucket。随后冻结 Supabase 写入、执行导入和校验，发布 CloudBase 小程序构建。验收通过后删除上述 Supabase 文件、依赖、环境变量、根 scripts 与旧开发诊断页，并将 DevTools 诊断页改为 CloudBase function/PG 检查。

- [ ] **Step 4: 执行全套静态、真实运行时与安全验收。**

Run:

```bash
pnpm install
pnpm run check
pnpm --dir mini-program typecheck
pnpm --dir mini-program lint
pnpm --dir mini-program test:unit
pnpm --dir mini-program build:weapp
node --test scripts/cloudbase/no-supabase-runtime.test.mjs
git diff --check
```

真实验收：真机首次用户、已迁移用户、冷启动、退出后手动进入、资料保存、身体档案新版本、目标新版本、餐食创建/编辑/归档/恢复、跨用户越权拒绝、图片私有访问、迁移行数/哈希/聚合一致。任何一项失败则停止发布，恢复上一小程序构建并保持 Supabase 导出快照只读。

- [ ] **Step 5: 提交。**

```bash
git add cloudbase scripts/cloudbase mini-program package.json pnpm-lock.yaml docs/cloudbase
git commit -m "feat: complete CloudBase backend cutover"
```

## 覆盖检查

- 身份、首登、退出、历史用户绑定：Task 4、Task 9。
- PostgreSQL schema、RLS、触发器、餐食原子事务：Task 3、Task 6。
- 私有资产与敏感数据处理：Task 7、Task 11。
- 小程序调用层、Repository、Store、页面：Task 8、Task 9、Task 10。
- 导入、校验、冻结写入、回退和删除 Supabase：Task 11、Task 12。

执行时必须按任务顺序推进；Task 2 的真实 PG probe、Task 3 的 schema/权限检查、Task 11 的数据校验、Task 12 的真机验收任一失败都不得进入下一阶段。
