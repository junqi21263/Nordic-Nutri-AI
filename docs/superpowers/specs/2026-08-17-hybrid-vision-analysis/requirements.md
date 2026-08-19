# Hybrid Vision Analysis：需求与验收条件

状态：Draft v2，等待第二次设计审批。本文档只定义需求，不执行代码、migration 或部署。

## 背景与已确认事实

当前生产证据显示：

- Qwen Flash 能够正常返回，provider 全局故障已排除。
- Storage 上传和临时 URL 生成已在成功样本中验证，系统性故障已排除。
- 当前 `qwen3-vl-flash` 请求在内部 `6,000 ms` 边界被 `ABORT_ERR` 中止。
- 简单样本成功、两个复杂套餐样本在约 6 秒失败，复杂图片慢路径具有强相关性，但仍保留 provider 延迟波动这一可能性。
- HEIC 转 JPEG 是独立待验证事项，不作为本次 Hybrid 方案的根因前提。

当前预算基线冻结为：客户端总预算 `15,000 ms`，服务端总预算 `12,500 ms`，Flash `6,000 ms`。本设计不改变这些数值。

## 目标

将 Vision 分析改造成“同步快路径 + 异步兜底”：

1. 低延迟样本继续用 HTTP 200 完成，保持当前体验。
2. 快路径无法在预算内完成时，将已创建的分析任务可靠地交给独立 worker，并返回 HTTP 202，而不是把 Vision 超时误报为上传失败。
3. 任务、quota、provider 调用、营养补全和 persistence 具备可恢复、幂等、可追踪的生命周期。
4. 老版本小程序在未声明支持 202 时继续使用旧合约，不被强制升级破坏。

## 非目标

本阶段不修改 JPEG quality、尺寸或 HEIC 策略，不更换 provider/model，不改变营养计算、meal save flow 或无关 Admin UI，不引入 retry 作为当前诊断修复，也不直接调整 6 秒、12.5 秒和 15 秒预算。

## 用户与系统需求

### R-001 快路径完成

当分析在快路径预算内完成安全检查、Vision、营养补全和持久化时，系统必须返回 HTTP 200，返回完整结果和 `analysisId`，任务状态为 `completed`，quota 状态为 `committed`。

### R-002 异步兜底

当新客户端声明支持异步合约，且快路径因 timeout、provider 5xx、可恢复网络错误，或 provider 已成功但剩余同步预算不足而未完成时，系统必须在服务端 deadline 前持久化任务并返回 HTTP 202。202 必须包含 `analysisId`、`status: processing` 和建议轮询间隔。

### R-003 请求生命周期隔离

当 HTTP 202 已返回后，原快路径 provider request 必须已经结束（成功、失败或被明确 abort）。若 provider 已成功且已保存 checkpoint，worker 必须从 `resumeStage=enriching` 继续，不得再次调用 provider；只有 provider 未成功且确需重试时，worker 才能发起独立 provider attempt。

### R-004 任务状态

系统必须记录 `created`、`uploaded`、`analyzing`、`enriching`、`persisting`、`completed`、`failed`、`timed_out`、`cancelled`。`completed`、`failed`、`timed_out`、`cancelled` 是 terminal state。

### R-005 analysisId 生命周期

服务端必须在一个数据库事务/RPC 中完成服务端生成的 `analysisId`、`ai_analysis(status=created)` 插入和 Hybrid quota reserve。任一步失败都必须回滚。后续同步 200、异步 202、轮询结果、trace 与 persistence 全部复用该 ID；不能等 Vision 成功后才生成。

### R-006 幂等

相同用户的相同 `clientRequestId` 必须映射到同一个 `analysisId`。重复点击、HTTP retry、重复 polling、worker 重入和 completed job 重试都不得重复创建任务、调用 provider、扣 quota 或写入 meal/analysis 结果。

### R-007 Quota

任务创建后保持 `reserved`；仅在完整结果持久化成功后转换为 `committed`；任何不可恢复的 terminal failure、timeout 或取消转换为 `released`。同一 `analysisId` 的 quota transition 必须原子且幂等。

### R-008 查询接口

认证用户只能查询自己的 `analysisId`。GET 查询无副作用，必须返回 processing、completed 或失败状态；不能因 polling 触发 provider、quota 或 persistence。

### R-009 老客户端兼容

未声明异步能力的旧客户端不得收到它无法处理的 202。旧客户端继续走现有同步合约；新客户端通过显式 capability 声明启用 Hybrid 行为。能力协商不能依赖 User-Agent 猜测。

### R-010 前端恢复

收到 202 后，前端必须显示“正在识别”而非“上传失败”，按退避间隔轮询；页面退出、重新进入和 App 切后台后能依据本地保存的 `analysisId` 恢复状态。

### R-011 重试边界

只有 timeout、provider 5xx 和临时网络错误允许进入受限异步 retry。无效图片、安全拒绝、provider 4xx、schema/business validation、quota 拒绝不得自动 retry。provider 最大 attempts 必须有硬上限。

### R-012 观测与隐私

每条请求必须可由 `clientRequestId → analysisId → traceId → jobId` 关联。trace 可记录 hash、状态、阶段和耗时，但不得记录 Base64、原始图片内容、secret、provider 原始 request ID 或可直接使用的 storage key。

### R-013 Atomic Analysis Creation

Hybrid 新链路不得继续把 `analysisId` 创建、分析记录插入和 quota reserve 作为三个独立动作。必须由单一事务/RPC 原子完成；旧 quota RPC 仅为旧链路兼容保留，不能作为 Hybrid 的创建路径。

### R-014 Durable Execution Ownership

系统必须同时记录业务 `status`、`execution_owner`、`dispatch_state`、`job_id`、`lease_until` 和 `version`。HTTP 202 后的 queued、claimed、running、reclaim 和迟到 fast handler 必须可由 CAS/lease 明确判定，旧 owner 不得覆盖新 owner 或 terminal state。

### R-015 Provider-success Checkpoint Resume

provider 成功但同步剩余预算不足时，系统必须持久化可安全复用的 provider result checkpoint 和 `resume_stage=enriching`，由 worker 继续 nutrition/evaluation/persistence；该路径的 `provider_attempt` 保持不变，禁止重复调用 Qwen。

### R-016 Server-authoritative Deadline

任务必须区分 `deadline_at` 与可查询/结果保留用的 `expires_at`。worker、reaper 和 GET status 以服务端 deadline/status 为权威，客户端不得仅依据本地 polling 时长宣布任务 timeout。

### R-017 Legacy Status Canonicalization

迁移前已有的 `status='succeeded'` 记录必须在 migration up 中明确 backfill 为 `completed`；新状态集合不得继续产生 `succeeded`。migration down 只能针对明确标记的 legacy-backfill 记录执行可逆恢复，不得无条件反向更新。

### R-018 Database-backed Durable Dispatch

PostgreSQL `ai_analysis` 中的 `dispatch_state=queued` 是异步任务的 durability source of truth。立即 HMAC/IAM 调用只是低延迟 trigger；trigger 失败必须由 timer dispatcher 扫描 queued row 补偿，worker lease 过期必须由 reaper CAS reclaim。

### R-019 Hybrid Reservation Expiry

Hybrid quota reservation 必须携带 `analysis_id`、`reservation_state` 和独立的 `reservation_expires_at`。该时间必须晚于 `deadline_at` 加 persistence/reaper grace；processing job 不能仅因旧链路 30 秒 TTL 到期而自动 release。

### R-020 One-to-many Trace Correlation

`analysisId` 是 correlation root；一个 analysis 可以关联多个 POST、GET、worker、dispatcher、reaper trace，以及多个 job execution/attempt。任何单个 `trace_id` 字段都不能覆盖完整的 analysis timeline。

## 验收原则

- 未完成 Phase 1–3 的实现和线上验收前，不得声称 Vision timeout 已修复。
- 设计审批只代表方案通过，不代表 migration、部署或真机验收通过。
- 所有生产测试必须记录 artifact SHA、feature flag 和 trace 关联，避免与当前 Diagnostic Baseline 混淆。
