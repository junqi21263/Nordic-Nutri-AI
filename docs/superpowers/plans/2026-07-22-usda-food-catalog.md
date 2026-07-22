# USDA 食物库 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为现有小程序增加安全、可缓存的 USDA 标准食物搜索与录入能力。

**Architecture:** 复用 `get-login-ticket` HTTP 云函数和产品 session。新 `food-catalog-service` 负责输入校验、PG 缓存与 USDA 映射；路由层仅负责鉴权和请求/响应。小程序经已有产品 API 客户端读取服务端结果并把选择项回填到餐食录入。

**Tech Stack:** CloudBase HTTP Function (Node.js 18), CloudBase PostgreSQL, Taro React, Vitest。

---

### Task 1: 定义服务器专用食物缓存表

**Files:**
- Create: `cloudbase/pg/migrations/0011_food_catalog.sql`
- Test: `cloudbase/pg/migrations/0011_food_catalog.sql` via CloudBase PG schema inspection

- [ ] **Step 1: 创建 `food_catalog` 及来源唯一索引**

```sql
create table public.food_catalog (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_food_id text not null,
  description text not null,
  brand_name text,
  data_type text,
  category text,
  serving_size numeric(10, 2),
  serving_unit text,
  calories_kcal_per_100g numeric(10, 2),
  protein_g_per_100g numeric(10, 2),
  carbs_g_per_100g numeric(10, 2),
  fat_g_per_100g numeric(10, 2),
  image_url text,
  source_url text,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_food_id)
);
```

- [ ] **Step 2: 启用 RLS 并创建拒绝客户端直连的策略**

```sql
alter table public.food_catalog enable row level security;
create policy "food catalog: server only" on public.food_catalog
  for all to public using (false) with check (false);
```

- [ ] **Step 3: 创建检索和过期缓存索引**

```sql
create index food_catalog_description_lower_idx
  on public.food_catalog ((lower(description)));
create index food_catalog_synced_at_idx on public.food_catalog (synced_at desc);
```

- [ ] **Step 4: 通过 `queryPgDatabase` 校验列、索引和策略**

Run: `queryPgDatabase(action="schema", objectName="public.food_catalog")`

Expected: 表包含来源键、标准营养字段和同步时间；无客户端开放策略。

### Task 2: 实现 USDA 映射和缓存服务

**Files:**
- Create: `cloudbase/functions/get-login-ticket/food-catalog-service.cjs`
- Create: `cloudbase/functions/get-login-ticket/food-catalog-service.test.mjs`

- [ ] **Step 1: 写关键词与 USDA 结果映射的失败测试**

```js
assert.throws(() => service.search("", 1), /FOOD_QUERY_INVALID/);
assert.equal(mapped.proteinGPer100g, 31.2);
```

- [ ] **Step 2: 实现最小服务**

```js
const service = createFoodCatalogService({ db, searchUsda, now });
await service.search("chicken", 1);
```

- [ ] **Step 3: 实现缓存优先、上游刷新和 20 条限制**

```js
const cached = await db.from("food_catalog").select("*")
  .ilike("description", "%chicken%").limit(20);
```

- [ ] **Step 4: 运行模块测试**

Run: `node --test cloudbase/functions/get-login-ticket/food-catalog-service.test.mjs`

Expected: PASS。

### Task 3: 接入现有 HTTP 路由

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Modify: `cloudbase/functions/get-login-ticket/index.test.mjs`

- [ ] **Step 1: 写 `/foods` 鉴权、方法和输入校验测试**

```js
assert.equal(response.statusCode, 401);
assert.equal(response.body.code, "UNAUTHORIZED");
```

- [ ] **Step 2: 注入 `foodCatalog` 服务并添加 GET 路由**

```js
if (foodRoute && req.method === "GET") {
  return sendJson(res, 200, await service.foodCatalog.search(session.sub, query, page));
}
```

- [ ] **Step 3: 运行函数测试**

Run: `node --test cloudbase/functions/get-login-ticket/*.test.mjs`

Expected: PASS。

### Task 4: 新增小程序 API 与食物搜索入口

**Files:**
- Create: `mini-program/src/api/food-catalog-api.ts`
- Modify: `mini-program/src/pages/manual-meal/index.tsx`
- Create: `mini-program/src/pages/food-catalog/index.tsx`
- Modify: `mini-program/src/app.config.ts`

- [ ] **Step 1: 写 API 映射测试**

```ts
expect(await searchFoodCatalog("chicken")).toHaveLength(1);
```

- [ ] **Step 2: 实现只经过 `requestProductApi` 的客户端查询**

```ts
return requestProductApi<ProductFood[]>(`/foods?query=${encodeURIComponent(query)}&page=${page}`, {
  method: "GET", fallbackMessage: "食物库暂时不可用，请稍后重试",
});
```

- [ ] **Step 3: 保持既有视觉体系的搜索与回填交互**

```tsx
<View onClick={() => selectFood(food)}><Text>{food.description}</Text></View>
```

- [ ] **Step 4: 构建微信小程序**

Run: `pnpm typecheck && pnpm lint && pnpm build:weapp && pnpm verify:weapp`

Expected: 全部 PASS。

### Task 5: 发布并验证

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/*`

- [ ] **Step 1: 先预览迁移**

Run: `managePgDatabase(action="planMigration", sql=<0011 SQL>)`

Expected: 仅创建 food catalog 相关对象。

- [ ] **Step 2: 应用迁移并回读结构**

Run: `managePgDatabase(action="applyMigration", sql=<0011 SQL>, confirm=true)`

Expected: `public.food_catalog` 可查询，RLS 为启用。

- [ ] **Step 3: 发布既有 HTTP 云函数**

Run: `manageFunctions(action="updateFunctionCode", functionName="get-login-ticket", functionRootPath="cloudbase/functions")`

Expected: 不新增公网入口；既有 Nodejs18.15 HTTP 函数变为 Active/Available。

- [ ] **Step 4: 检查函数状态与最近日志**

Run: `queryFunctions(action="getFunctionDetail", functionName="get-login-ticket")`

Expected: `Status=Active`，`AvailableStatus=Available`。
