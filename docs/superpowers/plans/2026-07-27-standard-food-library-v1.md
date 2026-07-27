# 标准食材库 V1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将主环境食物库升级为 4,000–5,000 条、完全由产品定义的标准食材目录，并只为已发布、可生成且无主图的食材分批创建混元生图任务。

**Architecture:** 主环境继续以 CloudBase PG + `get-login-ticket` HTTP 函数为唯一数据边界。分类树、标准食材、别名、营养参考和目录批次在 PG 中维护；版本化 JSONL 目录文件经过本地校验和管理员预览后才发布。远程 Worker 只生成图片，主环境继续存储、审核和发布图片。

**Tech Stack:** CloudBase PostgreSQL、`@cloudbase/node-sdk`、Node.js built-in test runner、JSONL、现有 `get-login-ticket` HTTP 云函数、混元远程 HMAC Worker。

---

## 文件结构

- Create: `cloudbase/pg/migrations/0014_standard_food_catalog.sql` — 分类树、目录状态、别名、营养参考、目录批次及索引/RLS。
- Create: `cloudbase/food-catalog/v1/taxonomy.json` — 已确认的一级/二级分类与排序。
- Create: `cloudbase/food-catalog/v1/*.jsonl` — 12 个按一级分类拆分的标准食材清单。
- Create: `cloudbase/functions/get-login-ticket/food-catalog-validation-service.cjs` — JSONL 单条校验、规范化和重复检测。
- Create: `cloudbase/functions/get-login-ticket/food-catalog-import-service.cjs` — 管理端预览、导入、发布和回退服务。
- Create: `cloudbase/functions/get-login-ticket/food-catalog-validation-service.test.mjs` — 目录字段、分类、重复和图片资格测试。
- Create: `cloudbase/functions/get-login-ticket/food-catalog-import-service.test.mjs` — 批次状态与幂等导入测试。
- Create: `scripts/food-catalog/validate-v1-catalog.mjs` — 不连接生产环境的目录总量/分类/唯一性校验。
- Create: `scripts/food-catalog/validate-v1-catalog.test.mjs` — 校验脚本的 fixture 测试。
- Modify: `cloudbase/functions/get-login-ticket/food-repository.cjs` — 分类树、已发布过滤、别名检索和新字段映射。
- Modify: `cloudbase/functions/get-login-ticket/food-repository.test.mjs` — 公开查询只返回已发布食材的回归测试。
- Modify: `cloudbase/functions/get-login-ticket/food-image-job-service.cjs` — 仅接受满足目录与图片资格的食物；支持按目录批次/分类创建队列。
- Modify: `cloudbase/functions/get-login-ticket/food-image-job-service.test.mjs` — 生图资格和批次上限测试。
- Modify: `cloudbase/functions/get-login-ticket/index.js` — 新管理路由与参数解析，不改变登录和 Worker 边界。
- Modify: `cloudbase/functions/get-login-ticket/index.test.mjs` — HTTP 路由、管理员鉴权与响应测试。
- Modify: `cloudbase/admin/food-images.html` — 显示目录批次、分类筛选、可生成数量和分批创建任务。
- Modify: `docs/FOOD_CATALOG_BACKEND.md`、`docs/FOOD_IMAGE_GENERATION.md` — 记录新目录和图片资格规则。

### Task 1: 写入模式契约与失败测试

**Files:**
- Create: `scripts/food-catalog/validate-v1-catalog.test.mjs`
- Create: `cloudbase/functions/get-login-ticket/food-catalog-validation-service.test.mjs`

- [ ] **Step 1: 为标准记录写失败测试**

```js
import assert from "node:assert/strict";
import test from "node:test";
import { validateCatalogRecord } from "../../cloudbase/functions/get-login-ticket/food-catalog-validation-service.cjs";

const taxonomy = new Map([["vegetable.leafy", { level: 2 }]]);

test("rejects a publishable record without a Chinese name, leaf category, or image subject", () => {
  const result = validateCatalogRecord({ canonical_key: "spinach-raw" }, taxonomy);
  assert.deepEqual(result.errors, ["NAME_ZH_REQUIRED", "LEAF_CATEGORY_REQUIRED", "NUTRITION_REQUIRED", "FOOD_FORM_REQUIRED", "IMAGE_SUBJECT_REQUIRED"]);
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `node --test scripts/food-catalog/validate-v1-catalog.test.mjs cloudbase/functions/get-login-ticket/food-catalog-validation-service.test.mjs`

Expected: FAIL，因为校验服务尚不存在。

- [ ] **Step 3: 定义固定 JSONL 记录形状**

在测试中使用并固定如下可发布记录；不允许以 USDA 名称或分类替代这些字段：

```json
{"canonical_key":"spinach-raw","name_zh":"菠菜","name_en":"Spinach","category_code":"vegetable.leafy","food_kind":"ingredient","food_form":"raw","default_cooking_method":"生","image_policy":"generate","image_subject_zh":"新鲜菠菜叶，去根洗净，浅米白桌面","nutrition_per_100g":{"calories":23,"protein_g":2.9,"carbs_g":3.6,"fat_g":0.4,"fiber_g":2.2},"aliases":["菠菜叶","spinach"],"references":[{"source":"china_food_composition","source_record_id":"spinach-raw-v1","nutrition_confidence":"high"}],"tags":["high_fiber","chinese_common"]}
```

- [ ] **Step 4: 提交测试基线**

```bash
git add scripts/food-catalog/validate-v1-catalog.test.mjs cloudbase/functions/get-login-ticket/food-catalog-validation-service.test.mjs
git commit -m "test: define standard food catalog contract"
```

### Task 2: 创建 PG 分类树与目录元数据迁移

**Files:**
- Create: `cloudbase/pg/migrations/0014_standard_food_catalog.sql`
- Modify: `scripts/cloudbase/verify-schema.test.mjs`

- [ ] **Step 1: 为迁移字段和 RLS 写静态断言**

断言迁移包含：`food_categories.parent_id`、`food_categories.level`、`foods.canonical_key`、`foods.publish_status`、`foods.food_kind`、`foods.food_form`、`foods.image_policy`、`foods.image_subject_zh`、`food_aliases`、`food_reference_sources`、`food_catalog_batches`，并且新表为 server-only RLS。

- [ ] **Step 2: 运行静态断言确认失败**

Run: `node --test scripts/cloudbase/verify-schema.test.mjs`

Expected: FAIL，指出缺少 0014 的表或字段。

- [ ] **Step 3: 写 0014 迁移（每条 SQL 单独可在 MCP 执行）**

迁移必须完成以下 SQL 语义：

```sql
alter table public.food_categories add column if not exists parent_id uuid references public.food_categories(id);
alter table public.food_categories add column if not exists level smallint not null default 1 check (level in (1,2));
alter table public.foods add column if not exists canonical_key text;
alter table public.foods add column if not exists publish_status text not null default 'quarantined'
  check (publish_status in ('draft','reviewing','published','quarantined','retired'));
alter table public.foods add column if not exists food_kind text not null default 'ingredient'
  check (food_kind = 'ingredient');
alter table public.foods add column if not exists food_form text;
alter table public.foods add column if not exists default_cooking_method text;
alter table public.foods add column if not exists image_policy text not null default 'none'
  check (image_policy in ('generate','licensed','external','none'));
alter table public.foods add column if not exists image_subject_zh text;
alter table public.foods add column if not exists catalog_version text;
```

创建 `food_aliases(food_id, alias, normalized_alias, language, alias_type)`、`food_reference_sources(food_id, source, source_record_id, source_payload_ref, nutrition_confidence)` 与 `food_catalog_batches(version, status, source_digest, validation_summary, created_by, published_at)`；为 `canonical_key`、`publish_status + category_id`、`normalized_alias` 建索引。对新表执行与 `food_image_jobs` 相同的 revoke、RLS 和 deny-all policy。

- [ ] **Step 4: 执行本地迁移静态验证**

Run: `node --test scripts/cloudbase/verify-schema.test.mjs`

Expected: PASS。

- [ ] **Step 5: 通过 MCP 预览迁移，不应用**

Run: `managePgDatabase(action="planMigration", sql=<0014 文件完整内容>)`

Expected: 迁移计划只包含新增列、表、索引、约束与 RLS；不包含 `DROP TABLE` 或删除既有图片。

- [ ] **Step 6: 提交迁移**

```bash
git add cloudbase/pg/migrations/0014_standard_food_catalog.sql scripts/cloudbase/verify-schema.test.mjs
git commit -m "feat: add standard food catalog schema"
```

### Task 3: 实现分类与标准食物目录校验器

**Files:**
- Create: `cloudbase/functions/get-login-ticket/food-catalog-validation-service.cjs`
- Create: `cloudbase/functions/get-login-ticket/food-catalog-validation-service.test.mjs`
- Create: `scripts/food-catalog/validate-v1-catalog.mjs`
- Create: `scripts/food-catalog/validate-v1-catalog.test.mjs`

- [ ] **Step 1: 补齐失败用例**

覆盖：重复 `canonical_key`、非叶子分类、未知分类、空中文名、宏量营养缺失、`food_kind !== ingredient`、`image_policy=generate` 但无 `image_subject_zh`、同一批次重复别名。

- [ ] **Step 2: 运行失败用例**

Run: `node --test cloudbase/functions/get-login-ticket/food-catalog-validation-service.test.mjs scripts/food-catalog/validate-v1-catalog.test.mjs`

Expected: FAIL，提示模块不存在。

- [ ] **Step 3: 实现纯函数校验器**

导出以下稳定 API：

```js
function validateCatalogRecord(record, taxonomyByCode) {
  // returns { normalized, errors: string[], warnings: string[] }
}
function validateCatalog(records, taxonomyByCode) {
  // returns { validRecords, invalidRecords, summary }
}
function normalizeAlias(value) {
  return String(value ?? "").trim().toLocaleLowerCase("zh-CN").replace(/\s+/g, " ");
}
```

`validateCatalog` 必须拒绝重复 `canonical_key`，并报告记录序号；只警告“参考来源不足”，但不能让 `published` 记录缺少任一基础营养字段。

- [ ] **Step 4: 实现目录 CLI**

`validate-v1-catalog.mjs` 读取 `taxonomy.json` 和所有 `cloudbase/food-catalog/v1/*.jsonl`，输出每个一级分类数量、总数、错误数和重复键；当总数不在 4,000–5,000 或存在错误时以退出码 1 结束。

- [ ] **Step 5: 运行通过测试与 CLI**

Run: `node --test cloudbase/functions/get-login-ticket/food-catalog-validation-service.test.mjs scripts/food-catalog/validate-v1-catalog.test.mjs && node scripts/food-catalog/validate-v1-catalog.mjs`

Expected: 单测通过；目录尚未填满时 CLI 明确输出 `CATALOG_COUNT_OUT_OF_RANGE`，不得伪报通过。

- [ ] **Step 6: 提交校验器**

```bash
git add cloudbase/functions/get-login-ticket/food-catalog-validation-service.cjs cloudbase/functions/get-login-ticket/food-catalog-validation-service.test.mjs scripts/food-catalog
git commit -m "feat: validate standard food catalog data"
```

### Task 4: 建立已确认分类与 4,000–5,000 条标准食材清单

**Files:**
- Create: `cloudbase/food-catalog/v1/taxonomy.json`
- Create: `cloudbase/food-catalog/v1/meat-poultry.jsonl`
- Create: `cloudbase/food-catalog/v1/seafood.jsonl`
- Create: `cloudbase/food-catalog/v1/egg-dairy.jsonl`
- Create: `cloudbase/food-catalog/v1/plant-protein.jsonl`
- Create: `cloudbase/food-catalog/v1/grains-tubers.jsonl`
- Create: `cloudbase/food-catalog/v1/vegetables.jsonl`
- Create: `cloudbase/food-catalog/v1/fruits.jsonl`
- Create: `cloudbase/food-catalog/v1/nuts-seeds.jsonl`
- Create: `cloudbase/food-catalog/v1/oils-seasonings.jsonl`
- Create: `cloudbase/food-catalog/v1/beverages.jsonl`
- Create: `cloudbase/food-catalog/v1/basic-processed.jsonl`
- Create: `cloudbase/food-catalog/v1/regional-staples.jsonl`

- [ ] **Step 1: 写分类总量测试**

`taxonomy.json` 必须精确包含设计规格中的 12 个一级分类和全部二级分类；测试断言目录总数在 4,000–5,000，蔬菜至少 850，谷薯至少 560，水果至少 560，且每个一级分类至少有一个二级叶子分类。

- [ ] **Step 2: 运行测试确认初始空目录失败**

Run: `node scripts/food-catalog/validate-v1-catalog.mjs`

Expected: FAIL，显示每个分类与目标数的缺口。

- [ ] **Step 3: 编写目录数据**

每行使用 Task 1 的 JSONL 形状。记录必须满足：

```text
中文标准名可单独被用户记录；
category_code 是 taxonomy 中的叶子；
canonical_key 在全目录唯一；
food_form 区分生/熟/干/罐/液体等营养不同形态；
references 至少有一个可追溯营养来源；
image_subject_zh 是单一食材主体，不含菜品、人物、文字、品牌或餐具要求以外的食物。
```

品牌 SKU、重复原始来源条目、组合菜、食谱、保健品和酒精饮品不得写入 V1 JSONL。

- [ ] **Step 4: 运行数据质量门禁**

Run: `node scripts/food-catalog/validate-v1-catalog.mjs`

Expected: PASS，并打印 12 个分类数量、总数、重复数 0、错误数 0。

- [ ] **Step 5: 生成可审阅摘要**

Run: `node scripts/food-catalog/validate-v1-catalog.mjs --write-summary docs/food-catalog-v1-summary.json`

Expected: 摘要仅包含分类数量、版本、校验结果和示例标准名，不包含密钥或原始供应商 payload。

- [ ] **Step 6: 提交目录数据（按分类分组）**

```bash
git add cloudbase/food-catalog/v1 docs/food-catalog-v1-summary.json
git commit -m "feat: add curated standard food catalog v1"
```

### Task 5: 实现目录批次导入、发布与原始数据隔离

**Files:**
- Create: `cloudbase/functions/get-login-ticket/food-catalog-import-service.cjs`
- Create: `cloudbase/functions/get-login-ticket/food-catalog-import-service.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/food-repository.cjs`
- Modify: `cloudbase/functions/get-login-ticket/food-repository.test.mjs`

- [ ] **Step 1: 写导入服务失败测试**

测试必须证明：dry-run 不写库；同版本再次导入幂等；`published` 批次才会暴露食物；现有 51 条 fixture 保留原 ID；60 条无中文 USDA 记录转为 `quarantined`；已批准鸡胸肉图片不被改动。

- [ ] **Step 2: 运行失败测试**

Run: `node --test cloudbase/functions/get-login-ticket/food-catalog-import-service.test.mjs cloudbase/functions/get-login-ticket/food-repository.test.mjs`

Expected: FAIL，因为导入服务与发布筛选尚不存在。

- [ ] **Step 3: 实现批次服务 API**

实现以下方法，并在所有写入前调用 Task 3 校验器：

```js
createCatalogBatch(userId, { version, records, dryRun })
publishCatalogBatch(userId, batchId)
rollbackCatalogBatch(userId, batchId)
quarantineLegacyRawFoods()
```

`createCatalogBatch` 仅由管理员调用；`dryRun=true` 返回 `{ validCount, invalidCount, duplicateKeys, categoryCounts }` 且没有 insert/update。发布时 upsert `foods`、`food_aliases` 和 `food_reference_sources`，再将该批次记录置为 `published`。回退只能将该批次记录置为 `retired`，不能删除有图片或历史引用的行。

- [ ] **Step 4: 让仓储层只查询发布食物**

修改 `listFoods`、`getFoodById`、`suggestions`、`listCategories`：公开读取都加 `.eq("publish_status", "published")`；分类返回树与已发布数量。别名检索先获得匹配 food IDs，再与主查询合并并去重；不能把原始来源字段返回给小程序。

- [ ] **Step 5: 运行服务和仓储测试**

Run: `node --test cloudbase/functions/get-login-ticket/food-catalog-import-service.test.mjs cloudbase/functions/get-login-ticket/food-repository.test.mjs`

Expected: PASS。

- [ ] **Step 6: 通过 MCP 执行迁移与受控导入**

先运行 `managePgDatabase(action="planMigration", sql=<0014>)`，人工确认无删除后运行 `applyMigration`。随后以管理员身份调用 dry-run，检查 4,000–5,000 条、零错误和分类数量；通过后调用正式导入与发布。完成后用 `queryPgDatabase` 读取分类数量、`published` 数量、`quarantined` 数量和鸡胸肉图片关联进行验证。

- [ ] **Step 7: 提交服务代码**

```bash
git add cloudbase/functions/get-login-ticket/food-catalog-import-service.cjs cloudbase/functions/get-login-ticket/food-catalog-import-service.test.mjs cloudbase/functions/get-login-ticket/food-repository.cjs cloudbase/functions/get-login-ticket/food-repository.test.mjs
git commit -m "feat: publish curated food catalog batches"
```

### Task 6: 暴露安全的目录与管理员接口

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Modify: `cloudbase/functions/get-login-ticket/index.test.mjs`

- [ ] **Step 1: 写 HTTP 路由失败测试**

覆盖以下调用：

```text
GET  /foods/categories                         → 仅活跃分类树
GET  /foods?query=菠菜&category=vegetable.leafy → 仅 published 食物
GET  /foods/suggestions?q=boli                 → 中文/拼音别名建议
POST /api/admin/food-catalog/batches/preview   → 管理员 dry-run
POST /api/admin/food-catalog/batches/:id/publish → 管理员发布
POST /api/admin/food-catalog/batches/:id/rollback → 管理员回退
```

测试必须断言：未登录 401、非管理员 403、公开查询不返回 `quarantined`、预览不写库。

- [ ] **Step 2: 运行失败测试**

Run: `node --test cloudbase/functions/get-login-ticket/index.test.mjs`

Expected: FAIL，路由不存在或响应不匹配。

- [ ] **Step 3: 添加路由与参数限制**

在 `getFoodRoute`/`getAdminFoodRoute` 增加上述路径；分页 `pageSize` 限制为 1–40，`query` 通过现有 `sanitizeFilterTerm` 限制为 48 字符。管理员路由调用 `isAdmin` 后才读取 JSON body 和调用导入服务。

- [ ] **Step 4: 运行通过测试**

Run: `node --test cloudbase/functions/get-login-ticket/index.test.mjs`

Expected: PASS。

- [ ] **Step 5: 提交 API 边界**

```bash
git add cloudbase/functions/get-login-ticket/index.js cloudbase/functions/get-login-ticket/index.test.mjs
git commit -m "feat: expose curated food catalog APIs"
```

### Task 7: 让图片队列只处理可发布标准食材

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/food-image-job-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/food-image-job-service.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/food-image-prompts.cjs`

- [ ] **Step 1: 写图片资格失败测试**

分别构造 `draft`、`quarantined`、`image_policy=none`、已有审核主图、缺 `image_subject_zh`、重复 `image_entity_key` 的食物。所有情况必须使 `createJob` 抛出稳定错误码；只有已发布且可生成的食材能建任务。

- [ ] **Step 2: 运行失败测试**

Run: `node --test cloudbase/functions/get-login-ticket/food-image-job-service.test.mjs`

Expected: FAIL，因为当前队列只检查是否已有图片。

- [ ] **Step 3: 实现资格守卫和分类批次入口**

在 `createJob` 前执行：

```js
if (food.publishStatus !== "published") throw new FoodImageJobError("FOOD_NOT_PUBLISHED");
if (food.imagePolicy !== "generate") throw new FoodImageJobError("FOOD_IMAGE_POLICY_BLOCKED");
if (!food.imageSubjectZh) throw new FoodImageJobError("FOOD_IMAGE_SUBJECT_REQUIRED");
```

新增 `createBatchByCatalog(userId, { catalogVersion, categoryCode, limit, candidateCount })`。`limit` 限制 1–300，默认 `candidateCount=1`；查询必须按 `recommendation_weight DESC`、无主图和目录版本过滤。提示词使用 `image_subject_zh` 作为主体，`food_form`/`default_cooking_method` 作为形态约束；不得从美国来源描述猜测图片内容。

- [ ] **Step 4: 运行通过测试**

Run: `node --test cloudbase/functions/get-login-ticket/food-image-job-service.test.mjs`

Expected: PASS。

- [ ] **Step 5: 提交图片资格控制**

```bash
git add cloudbase/functions/get-login-ticket/food-image-job-service.cjs cloudbase/functions/get-login-ticket/food-image-job-service.test.mjs cloudbase/functions/get-login-ticket/food-image-prompts.cjs
git commit -m "feat: gate food image jobs by catalog status"
```

### Task 8: 更新管理页、文档并进行分批验收

**Files:**
- Modify: `cloudbase/admin/food-images.html`
- Modify: `docs/FOOD_CATALOG_BACKEND.md`
- Modify: `docs/FOOD_IMAGE_GENERATION.md`

- [ ] **Step 1: 写管理页静态回归检查**

在已有管理员页检查中断言页面存在：分类选择器、目录版本、可生成数量、每批 1–300、候选数默认 1、预览按钮与审核队列筛选；不得把模型密钥、HMAC 密钥或原始来源 payload 写进页面。

- [ ] **Step 2: 更新管理页**

管理页流程固定为：选择已发布目录版本 → 选择分类/数量 → 获取预览 → 明确确认创建任务 → 处理队列 → 人工审核 → 设为主图。首页不允许存在“一键为全库生图”按钮。

- [ ] **Step 3: 更新文档**

文档必须说明：自定义分类优先、USDA 仅作参考、`quarantined` 不可展示/不可生图、候选图必须审核、默认每食物一张候选、主环境保存图片。

- [ ] **Step 4: 跑完整静态测试**

Run: `node --test cloudbase/functions/get-login-ticket/*.test.mjs scripts/cloudbase/verify-schema.test.mjs scripts/food-catalog/validate-v1-catalog.test.mjs && node scripts/food-catalog/validate-v1-catalog.mjs && git diff --check`

Expected: 全部 PASS；目录总数 4,000–5,000；零校验错误。

- [ ] **Step 5: 部署并做运行时验收**

1. 部署主环境 `get-login-ticket`，确认函数为 `Active/Available`。
2. 以管理员会话验证分类树、中文/别名搜索、公开查询不返回隔离数据、目录预览和发布。
3. 对单一分类创建 100 条、每条 1 候选的图片批次；确认任务只含 `published + generate + 无主图` 食物。
4. 处理队列并审核至少 10 张；确认图片文件在主环境、候选图不自动成为主图、批准后小程序可展示。
5. 在确认审核吞吐量后，将批次扩大到 100–300；每日生成上限从 500 调整前必须先获得产品确认。

- [ ] **Step 6: 提交管理与文档改动**

```bash
git add cloudbase/admin/food-images.html docs/FOOD_CATALOG_BACKEND.md docs/FOOD_IMAGE_GENERATION.md
git commit -m "docs: document curated food catalog workflow"
```

## 覆盖检查

- 自定义两级分类与 4,000–5,000 条范围：Tasks 2、3、4。
- 标准食材、别名、营养参考、目录版本：Tasks 2、3、5。
- 原始 USDA 隔离但保留溯源：Task 5。
- 公开搜索、分页和服务端 RLS 边界：Tasks 2、5、6。
- 远程 Worker 仅生成、主环境存储审核：Task 7、Task 8。
- 不自动生图/发布且按批审核：Task 7、Task 8。
