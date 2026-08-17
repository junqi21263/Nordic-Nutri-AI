---
goal: Budgeted fast path for food-image recognition
version: 1.0
date_created: 2026-08-15
last_updated: 2026-08-17
owner: Nordic Nutri AI
status: Completed
approval: Approved / Ready for Implementation
tags: [feature, performance, vision, reliability, observability]
---

# Introduction

![Status: Completed](https://img.shields.io/badge/status-Completed-brightgreen)

Approval: **Approved / Ready for Implementation**

为 `/vision-analysis` 建立统一的端到端 deadline，使 Flash 成为可交付主链，Plus 仅作为受预算约束的 best-effort enhancement；同时改善多菜混合餐盘识别提示词、错误语义和阶段耗时观测。首轮不改变 API 请求/响应字段，不后台化关键 persistence，不新增识别状态机。

## 1. Requirements & Constraints

- **REQ-001**: 识别 SLA 从 `wx.chooseMedia` 成功返回可用图片，或已有图片点击开始识别的时刻起算，到 `analysis-result` 获得可展示结果为止；总预算为 15,000ms，目标 P50 ≤ 8s、P95 ≤ 15s。用户参与的媒体获取时间不计入该 SLA。
- **REQ-002**: 服务端必须使用一个 absolute deadline；所有阶段只能消费 `remainingMs()`，禁止把阶段 timeout 简单相加。
- **REQ-002A**: 唯一服务端 `startedAt`/`deadlineAt` 必须在 `index.js` 的 `/vision-analysis` handler 入口创建；下游模块只消费传入的 budget context，不得重新起算 deadline。
- **REQ-002B**: 客户端必须在可用图片取得后创建唯一 `clientDeadlineAt`；本地读取/压缩、请求、解析和结果就绪均消费同一 deadline，不能把 15 秒重新用于 `wx.request`。媒体获取时间单独记录为 `media_acquisition_ms`。
- **REQ-003**: Flash 返回有效结果即具备成功返回资格；Plus 不得成为成功判定条件。
- **REQ-004**: Plus timeout、Abort、HTTP/SDK 错误、JSON/schema 无效、空 items 或明显低质量结果，均必须 fallback 到 Flash。
- **REQ-005**: Flash 完成后，只有在扣除 nutrition 与 persistence 保底预算后仍有剩余时间，才允许调用 Plus。
- **REQ-006**: 上传和微信图片安全检查的重试必须受同一个 absolute deadline 控制；预算不足时不得重试。
- **REQ-007**: 首轮必须在返回前完成安全检查、稳定图片引用、有效 `analysisId`、必要 nutrition 处理和关键 persistence。
- **REQ-008**: persistence 失败时不得返回虚假的 `analysisId`；必须返回稳定业务错误。
- **REQ-008A**: nutrition 判定必须使用 `isSaveableNutrition(...)`：Flash nutrition 已满足 analysis-result 与保存本餐字段约束时属于 enrichment；缺失或非法且必须 backfill 才可保存时属于 required。
- **REQ-008B**: required nutrition failure 导致识别失败；enrichment timeout/failure 使用 Flash nutrition 正常返回，并记录 fallback。
- **REQ-008C**: V1 evaluation 保持同步语义并受同一 absolute deadline 控制；Plus gate、upload retry 和 security retry 均必须为 evaluation 保留 downstream mandatory budget。
- **REQ-009**: 保持 `/vision-analysis` 当前请求与响应字段、结果页字段语义和“保存本餐”引用语义不变。
- **REQ-010**: 多菜混合餐盘 prompt 必须按区域观察，覆盖可见独立菜品、主食/蛋白质/蔬菜/配菜/酱汁、遮挡和不确定性，不因不确定而无限增强。
- **REQ-011**: Abort/Timeout/Network/Model failure 必须映射为稳定业务错误；不能向用户展示 `This operation was aborted`。优先复用既有 failure envelope 与 HTTP status；仅当现有响应已支持业务 code 时才写入既有 code 字段，不得为本轮新增响应字段。
- **REQ-012**: 记录 `media_acquisition_ms`、`image_prepare_ms`、`upload_ms`、`safety_check_ms`、`flash_ms`、`plus_ms`、`nutrition_ms`、`evaluation_ms`、`persistence_ms`、`total_ms`、`server_total_ms`、`client_total_ms` 以及 Flash/Plus/fallback/abort/dish-count、`deadline_exhausted_stage`、`plus_skip_reason`、`fallback_reason`、`upload_retry_count` 字段。
- **CON-001**: 不修改 Auth、微信登录、Session、API contract、数据库结构、Feedback、Milestone、Achievement 状态机、结果页 UI 或保存本餐核心流程。
- **CON-002**: 不新增前端 polling、pending 状态、全局 store、MealSaveService、SaveCoordinator、Repository、adapter 或新的识别状态机。
- **CON-003**: 第一轮不后台化 persistence、图片关联、保存依赖的 nutrition 数据或 evaluation；是否后台化 evaluation 只能作为后续独立变更。
- **CON-004**: 任何新增 timeout 必须由 absolute deadline 计算得出，不能绕过 `remainingMs()`。

### 固定预算常量

| Identifier | Value | 用途 |
|---|---:|---|
| `VISION_CLIENT_BUDGET_MS` | 15,000 | 客户端端到端硬预算 |
| `VISION_SERVER_BUDGET_MS` | 12,500 | 服务端为返回网络与客户端解析预留余量 |
| `VISION_SECURITY_MAX_MS` | 2,000 | 单次安全检查阶段上限 |
| `VISION_UPLOAD_ATTEMPT_MAX_MS` | 2,500 | 单次上传上限 |
| `VISION_FLASH_MAX_MS` | 6,000 | Flash 上限 |
| `VISION_PLUS_MAX_MS` | 3,000 | Plus 最大值，但必须再受剩余预算限制 |
| `VISION_NUTRITION_RESERVE_MS` | 1,200 | Flash 后 nutrition 保底 |
| `VISION_EVALUATION_MAX_MS` | 2,500 | V1 evaluation 同步阶段上限 |
| `VISION_EVALUATION_RESERVE_MS` | 2,500 | Flash/Plus 后 evaluation 保底 |
| `VISION_PERSISTENCE_RESERVE_MS` | 1,800 | Flash 后关键持久化保底 |

以上时间均为单阶段最大 cap，不代表可以累加消费。每阶段实际 timeout 必须取 `min(stageMax, budgetAvailableForStage)`；absolute deadline 永远具有最高优先级。所有 retry 和 optional enhancement 都不得侵占后续 mandatory stages 的保底预算。

## 2. Implementation Steps

### Implementation Phase 1 — Observability and deadline primitives

- GOAL-001: 建立可复用的 absolute deadline / remaining budget 原语，并先记录现有阶段耗时。
- 执行顺序约束：TASK-001 与 TASK-003 必须先于任何 timeout 数值调整；随后接入 TASK-002/TASK-004 的观测，禁止先改局部 timeout 再补全局 deadline。

| Task | Description | Completed | Date |
|---|---|---|---|
| TASK-001 | 在 `cloudbase/functions/get-login-ticket/index.js` 的 `/vision-analysis` handler 入口创建唯一 `startedAt`、`deadlineAt`、`remainingMs()` budget context，并向 security、upload、qwen、nutrition、evaluation、persistence 全链路传递；`vision-data-service.cjs` 只消费该 context，不重新起算 deadline。 | | |
| TASK-002 | 在 `cloudbase/functions/get-login-ticket/index.js` 为成功/失败记录 `server_total_ms`、abort reason、model hops、dish count，并保留现有 `vision_latency_ms`。 | | |
| TASK-003 | 在 `food-scanner/index.tsx` 的 `chooseMedia` 成功返回可用图片后创建唯一 `clientDeadlineAt`，单独记录 `media_acquisition_ms`，并记录 `image_prepare_ms` 与最终 `client_total_ms`；`vision-api.ts` 只记录 request/parse 阶段并消费传入的 remaining timeout，不新增 API 字段或 telemetry endpoint。 | | |
| TASK-004 | 使用现有 `observability-service.cjs` 的 `recordMetric` 记录阶段指标和 meta，包括 `evaluation_ms`；不改数据库 schema。 | | |
| TASK-004A | 在 budget context 中实现一个统一的 `remainingAfterReserve(requiredReserveMs)` helper；security retry、upload retry、Plus gate 只能通过该 helper 计算可用预算，禁止各处手写 downstream reserve 减法。 | | |

### Implementation Phase 2 — Deadline-aware critical path

- GOAL-002: 将安全检查、上传、Flash、nutrition、persistence 纳入同一 deadline，并保证关键引用在返回前稳定。

| Task | Description | Completed | Date |
|---|---|---|---|
| TASK-005 | 修改 `wechat-image-security.cjs` 的网络调用，使每次请求接收阶段 deadline，并通过统一 reserve helper 保留 Flash、required nutrition、evaluation、persistence 预算；过期立即返回可分类 timeout，不允许无界等待或超预算刷新 token。 | | |
| TASK-006 | 修改 `index.js` 的 `uploadVisionImage` 接收 deadline；retry 可用预算必须通过统一 reserve helper 扣除 Flash、required nutrition、evaluation、persistence 等 downstream mandatory reserve，首次失败后最多一次短重试；无预算时立即终止并记录 `upload_retry_count`。 | | |
| TASK-007 | 修改 `vision-data-service.cjs`：安全检查、上传、Flash、nutrition、同步 evaluation、`uploaded_assets`/`ai_analysis` 持久化均使用 `remainingMs()`；持久化失败不得继续返回随机 `analysisId`。 | | |
| TASK-008 | 基于现有保存字段约束实现 `isSaveableNutrition(...)`；Flash nutrition 满足约束则将 nutrition backfill 标为 enrichment，否则将其标为 required。required 失败返回失败；enrichment 失败使用 Flash nutrition，并记录 `nutrition_blocking`、`nutrition_fallback_used`。 | | |
| TASK-009 | 对服务端 deadline 到期、上传失败、安全失败、required nutrition 失败、持久化失败产生稳定内部 classification（如 `VISION_TIMEOUT`、`VISION_UPLOAD_FAILED`、`VISION_SECURITY_FAILED`、`VISION_MODEL_FAILED`、`VISION_PERSISTENCE_FAILED`）；优先复用既有 failure envelope/status，若无既有 code 则仅用于日志和客户端现有错误映射，不新增响应字段。 | | |

### Implementation Phase 3 — Flash/Plus best-effort and accuracy prompt

- GOAL-003: 移除 Plus 对主成功条件的依赖，并改善多菜餐盘识别约束。

| Task | Description | Completed | Date |
|---|---|---|---|
| TASK-010 | 修改 `qwen-vision-service.cjs`：Flash 有效后通过统一 reserve helper 扣除 required nutrition、evaluation、persistence 保底；不足则跳过 Plus。 | | |
| TASK-011 | 捕获 Plus timeout、Abort、HTTP/SDK、JSON parse、schema invalid、空 items 和无效结果；任何非有效增强结果都返回 Flash，并设置 `fallback_to_flash`、`fallback_reason`、`plus_timeout` 等 meta。 | | |
| TASK-012 | 只使用确定性的结构/业务 validator 接受 Plus：schema valid、`items.length > 0`、`mealName` 有效、保存所需 numeric nutrition 字段均 finite 且 `>= 0`、无 NaN/Infinity/缺失字段。通过 validator 即视为有效 enhancement；未通过则保留 Flash。V1 不建立 Flash/Plus 主观质量评分、confidence 排名或复杂结果比较系统。 | | |
| TASK-013 | 更新 Qwen vision prompt，要求区域扫描、独立菜品枚举、类别区分、可见性边界、份量置信度和不确定项表达；保留现有 JSON 字段。 | | |

### Implementation Phase 4 — Client error semantics and tests

- GOAL-004: 让客户端只展示稳定业务错误，并覆盖所有 deadline/fallback 边界。

| Task | Description | Completed | Date |
|---|---|---|---|
| TASK-014 | 修改 `mini-program/src/api/vision-api.ts` 和 `mini-program/src/pages/food-scanner/index.tsx`：将 Abort/timeout/network/model failure 映射为中文业务错误；Flash fallback 成功时不弹失败提示。 | | |
| TASK-015 | 更新 `qwen-vision-service.test.mjs` 覆盖 Plus 成功、timeout、Abort、500、非法 JSON、空 items、低质量、剩余预算不足和 Flash 失败。 | | |
| TASK-016 | 更新 `vision-data-service.test.mjs` 覆盖上传有限重试、无预算不重试、nutrition fallback、persistence failure 不返回虚假 analysisId、阶段 metrics。 | | |
| TASK-017 | 更新 `index.test.mjs`、`wechat-image-security` 测试和 `mini-program/tests/vision-api-boundary.test.ts`，验证稳定错误语义、deadline 传播和既有 API 字段不变。 | | |
| TASK-018 | 运行 targeted tests、typecheck、lint、unit tests、weapp build/verify；记录真实设备或开发者工具的 15 秒采样数据。 | | |

## 3. Alternatives

- **ALT-001**: 只调大/调小现有 timeout；拒绝，因为没有统一总预算，阶段 timeout 会叠加。
- **ALT-002**: 立即把 persistence、图片关联和 nutrition 全部后台化；拒绝，因为会破坏 `analysisId`、图片引用和保存本餐可靠性。
- **ALT-003**: 新增前端 polling 或 recognition state machine；拒绝，因为会改变现有 API/UI 约束。
- **ALT-004**: Flash/Plus 结果统一抽成新的 service/coordinator；拒绝，首轮只做局部 deadline/fallback 修改。

## 4. Dependencies

- **DEP-001**: 现有 Qwen Flash/Plus 服务、Vita fallback、CloudBase storage、微信图片安全检查和现有 `observability-service.cjs`。
- **DEP-002**: 现有 `uploaded_assets` 与 `ai_analysis` persistence 行为；不新增数据库迁移。
- **DEP-003**: 现有 mini-program vision API 和 analysis-result/save flow；不改变字段契约。

## 5. Files

- **FILE-001**: `cloudbase/functions/get-login-ticket/vision-data-service.cjs` — deadline、阶段计时、nutrition/persistence 关键路径。
- **FILE-002**: `cloudbase/functions/get-login-ticket/index.js` — upload deadline、route metrics、稳定错误。
- **FILE-003**: `cloudbase/functions/get-login-ticket/qwen-vision-service.cjs` — Flash/Plus budget、fallback、prompt。
- **FILE-004**: `cloudbase/functions/get-login-ticket/wechat-image-security.cjs` — security deadline。
- **FILE-005**: `cloudbase/functions/get-login-ticket/observability-service.cjs` — 仅在现有 metric 汇总无法承载阶段指标时最小修改。
- **FILE-006**: `mini-program/src/api/vision-api.ts` — client budget、timing、错误映射。
- **FILE-007**: `mini-program/src/pages/food-scanner/index.tsx` — UI-facing error mapping，不改结果/保存流程。
- **FILE-008**: 相关 `*.test.mjs`、`vision-api-boundary.test.ts` — deadline/fallback/error contract tests。
- **FILE-009**: `cloudbase/functions/get-login-ticket/vision-budget.cjs` — 唯一 deadline 与统一 downstream reserve helper。

## 6. Testing

- **TEST-001**: Flash 成功 + Plus 成功返回 Plus。
- **TEST-002**: Flash 成功 + Plus timeout/Abort/500/非法 JSON/空 items/低质量，均返回 Flash 且不触发客户端错误弹窗。
- **TEST-003**: Flash 成功但剩余预算不足时不调用 Plus。
- **TEST-004**: Flash timeout 或无有效 items 时返回稳定识别失败错误。
- **TEST-005**: 上传首次失败且有预算时最多一次短重试；无预算时不重试。
- **TEST-005A**: upload/security retry 必须验证已扣除 Flash、required nutrition、evaluation、persistence downstream reserve，不得消耗后续 mandatory work 预算。
- **TEST-006**: 安全检查 timeout/重试受 absolute deadline 限制。
- **TEST-007**: nutrition 超时时使用当前允许的 Flash fallback，并记录 required/enrichment 指标。
- **TEST-007A**: `isSaveableNutrition(...)` 对完整 Flash snapshot 判定 enrichment，对缺失/非法字段判定 required；required 失败与 enrichment fallback 行为分别验证。
- **TEST-007B**: evaluation 保持同步语义，受 `VISION_EVALUATION_MAX_MS` 与统一 deadline 限制，并记录 `evaluation_ms`；Plus gate、upload retry、security retry 均验证为 evaluation 保留预算。
- **TEST-008**: persistence 失败不返回虚假 `analysisId`，成功路径仍返回有效 analysisId/imagePath。
- **TEST-009**: 服务端不向客户端暴露 `This operation was aborted`。
- **TEST-009A**: 既有 failure envelope/status 不变；若不存在业务 code，验证错误 classification 只进入日志/客户端现有映射，不新增响应字段。
- **TEST-010**: 多菜餐盘 prompt 保留 JSON schema，items/dish_count/不确定项可观测。
- **TEST-011**: API 请求/响应字段、analysis-result 和保存本餐依赖不变。
- **TEST-012**: `pnpm --dir mini-program typecheck`、`lint`、`test:unit`、`build:weapp`、`verify:weapp` 全部通过。

## 7. Risks & Assumptions

- **RISK-001**: 将模型 timeout 降至预算范围可能增加 Flash 失败率；必须通过阶段 metrics 和真实采样决定是否调整上限。
- **RISK-002**: 微信安全检查 token 首次获取可能消耗较多时间；deadline 超时必须返回可理解错误，而不是无限刷新 token。
- **RISK-003**: 现有 persistence 代码在数据库失败时保留随机 UUID；本计划要求改为失败返回，这是保证保存引用可靠性的必要行为，需更新既有测试。
- **RISK-004**: Plus “明显低质量”判断必须保持保守；首轮只拒绝结构无效、空 items、明显丢失或置信度显著下降的结果。
- **RISK-005**: `client_total_ms` 首轮通过结构化客户端诊断日志记录，不新增 telemetry API；若需要生产 percentile dashboard，另立后续任务。
- **ASSUMPTION-001**: Flash 返回的基础 nutrition snapshot 足以支撑当前结果页和保存本餐；nutrition backfill 失败时继续使用现有 fallback 语义。
- **ASSUMPTION-002**: `recordMetric` 可承载新增 metric 名称和 meta，不需要修改数据库 schema。
- **ASSUMPTION-003**: 本轮不调整页面识别动画时长，不把视觉动画完成时间误作模型完成时间。

## 8. Related Specifications / Further Reading

- `/vision-analysis` route: `cloudbase/functions/get-login-ticket/index.js`
- Vision orchestration: `cloudbase/functions/get-login-ticket/vision-data-service.cjs`
- Qwen model routing: `cloudbase/functions/get-login-ticket/qwen-vision-service.cjs`
- Client boundary: `mini-program/src/api/vision-api.ts`
- User-provided requirements: 15s end-to-end budget, Flash-first best-effort Plus, multi-dish accuracy, stable Chinese errors.
