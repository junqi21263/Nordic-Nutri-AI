# Food Image Prompt Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让食物图片生成按真实视觉形态选择模板，并在任务和审核链路中保留可审计的识别结果与人工覆盖。

**Architecture:** 保留 `food-image-prompts.cjs` 作为唯一提示词入口，在该模块中增加视觉类型规则、模板注册表、风味颜色和负面提示词。任务服务将完整食物元数据传入 builder 并保存计划快照；管理台只扩展既有 inspector 和重新生图请求。

**Tech Stack:** Node.js CommonJS、CloudBase PG migration、Hunyuan image service、静态 HTML 管理后台、node:test。

---

### Task 1: 建立可复现的视觉类型失败测试

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/food-image-prompts.test.mjs`
- Test: `cloudbase/functions/get-login-ticket/food-image-prompts.test.mjs`

- [ ] **Step 1: 写入加工食品优先级断言**

为饮料粉、葡萄酒、苹果醋、番茄酱、咖啡粉、低筋面粉和草莓酸奶调用 `buildFoodImagePromptPlan`，断言 `visualType`、`matchedKeywords`、`flavorColor`、`subject`、`negativePrompt` 和不应出现的水果描述。

- [ ] **Step 2: 运行定向测试并确认当前失败**

Run: `node --test cloudbase/functions/get-login-ticket/food-image-prompts.test.mjs`

Expected: FAIL，因为当前计划没有 `visualType` 且水果分类会抢占饮料粉/酒类。

- [ ] **Step 3: 保持旧模板回归用例**

保留海螺、生熟状态、审核反馈和 500 字符截断断言，确保新引擎不破坏已发布的贝类修复。

### Task 2: 实现统一视觉类型解析与模板注册表

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/food-image-prompts.cjs`
- Test: `cloudbase/functions/get-login-ticket/food-image-prompts.test.mjs`

- [ ] **Step 1: 增加类型、规则和解析函数**

导出 `FOOD_VISUAL_TYPES`、`FOOD_VISUAL_TYPE_OPTIONS`、`resolveFoodVisualType(food)`、`resolveFlavorColor(food)`。规则按来源执行：人工覆盖、标签、中文名、英文名、分类、fallback；每个来源内部按最长关键词、加工优先级、稳定顺序排序。

- [ ] **Step 2: 增加公共摄影基础与视觉模板**

以 `buildBasePhotographyPrompt()` 维护统一摄影约束；以 `VISUAL_TYPE_TEMPLATES` 覆盖规格列出的所有视觉类型，并让加工模板包含反歧义说明与专属负面词。

- [ ] **Step 3: 将计划构建器迁移到视觉模板**

`buildFoodImagePromptPlan` 先解析类型再选模板，继续保留壳类、生熟视觉状态、审核反馈、长度预算和旧调用兼容字段。计划输出增加 `visualType`、`visualTypeLabelZh`、`decisionSource`、`matchedKeywords`、`flavorColor`、`templateName`、`positivePrompt` 与 `negativePrompt`。

- [ ] **Step 4: 运行提示词测试并确认通过**

Run: `node --test cloudbase/functions/get-login-ticket/food-image-prompts.test.mjs`

Expected: PASS。

### Task 3: 贯通食物元数据、任务与批量快照

**Files:**
- Modify: `cloudbase/functions/get-login-ticket/food-image-job-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/food-image-batch-service.cjs`
- Modify: `cloudbase/functions/get-login-ticket/food-repository.cjs`
- Modify: `cloudbase/functions/get-login-ticket/food-image-job-service.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/food-image-batch-service.test.mjs`

- [ ] **Step 1: 扩展 food 映射**

将可空的 `visual_type` 映射为 `visualType`，并将现有 tags、foodForm、分类完整传递给 prompt engine。

- [ ] **Step 2: 在单任务、批量预览、批量执行和重试中传递相同输入**

每条路径均传入 `tags`、`foodForm`、`visualType`、名称、英文名、分类、烹饪方式、`imageSubjectZh`，避免 batch/retry 退化回旧分类模板。

- [ ] **Step 3: 用真实服务夹具验证快照与重生图**

断言 `prompt_plan_json` 含视觉类型；重新生成仍调用原任务状态机并使用人工覆盖，而不删除旧审核逻辑。

### Task 4: 增加兼容迁移与后台人工覆盖/诊断展示

**Files:**
- Create: `cloudbase/pg/migrations/0031_food_visual_type.sql`
- Create: `cloudbase/pg/migrations/0031_food_visual_type.test.mjs`
- Modify: `cloudbase/functions/get-login-ticket/index.js`
- Modify: `cloudbase/admin/food-images.html`
- Modify: `cloudbase/admin/food-images.test.mjs`

- [ ] **Step 1: 增加可空人工覆盖字段**

迁移添加 `foods.visual_type text null` 与闭集检查；空值表示自动识别，不回填或修改历史任务。

- [ ] **Step 2: 增加安全的更新接口**

复用现有管理员 food API，白名单接受 `visualType` 或 `null`，保存后重新生成通过已有 endpoint 生效。

- [ ] **Step 3: 扩展既有 inspector**

在“查看自动提示词”内显示名称、英文名、分类、标签、视觉类型、来源、关键词、模板、风味颜色、主体、正向和负向提示词；增加选择器，保存覆盖后可点击现有重新生图。

- [ ] **Step 4: 验证静态管理台契约**

Run: `node --test cloudbase/admin/food-images.test.mjs cloudbase/pg/migrations/0031_food_visual_type.test.mjs`

Expected: PASS。

### Task 5: 验证与回归

**Files:**
- Modify: `docs/FOOD_IMAGE_GENERATION.md`

- [ ] **Step 1: 更新生图文档**

说明视觉类型优先级、人工覆盖、Hunyuan 只接收正向 `prompt`、负面词如何拼接和审核诊断字段。

- [ ] **Step 2: 跑定向与全量函数测试**

Run: `pnpm test`（按 package scripts 选择实际函数测试命令）、管理台测试、迁移测试、`node -c` 与 `git diff --check`。

- [ ] **Step 3: 运行小程序 typecheck/build**

Run: `pnpm run typecheck:mini-program && pnpm --dir mini-program build:weapp`

Expected: PASS；若环境或既有问题阻塞，精确报告区别于本改动。

- [ ] **Step 4: 完成 CloudBase 代码审查**

检查 PG migration、HTTP 管理接口、Hunyuan 调用和静态管理台，确认没有将服务器凭据、独立 `negative_prompt` 或不兼容 SDK 参数带入实现。
