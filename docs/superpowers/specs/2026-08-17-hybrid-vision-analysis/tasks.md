# Hybrid Vision Analysis：分阶段实施计划

状态：Draft v2，等待第二次设计审批。以下是实施顺序，不代表已经执行。

## Phase 0：审批前的只读核对

- [x] 读取并确认现有 `ai_analysis`、`uploaded_assets`、quota RPC 的实际 schema、约束和索引。
- [x] 确认现有 persistence 是否可以接受 `created/uploaded/analyzing` 半成品记录。
- [x] 确认 CloudBase 是否提供适合本项目的独立 worker invocation、定时 reaper 和内部鉴权机制。
- [x] 确认当前前端构建版本、后端 artifact 和 Diagnostic Baseline SHA，作为新旧行为对照基线。
- [x] 设计审批：确认 `analysisId`、202 capability、quota 原子性和 worker 方案。

## Phase 0.5：Design reconciliation

Phase 0 read-only audit 已完成；本轮 Design Closure 已完成，Phase 1 仍锁定。以下契约已写入 Draft v2，待第二次设计审批确认后才允许进入 migration/编码：

- [x] 将 `analysisId + ai_analysis(created) + quota reserve` 定义为单一 `createVisionAnalysis` 原子事务/RPC。
- [x] 更新 `ai_analysis` proposed schema：`execution_owner`、`dispatch_state`、`lease_until`、`version`、`deadline_at`、`expires_at`、`resume_stage`、checkpoint 字段。
- [x] 更新 `uploaded_assets`：新增 nullable `analysis_id`、FK 和索引；确认不使用 `ON DELETE CASCADE` 代替 retention。
- [x] 定义 `execution_owner / dispatch_state / job_id / lease_until / version` 的 CAS、claim、reclaim 语义。
- [x] 定义 provider-success checkpoint：`resume_stage=enriching` 时 worker 不再次调用 provider。
- [x] 将 quota reservation TTL 与 async job deadline 分离；明确 worker/reaper 的显式 commit/release。
- [x] 钉死 GET terminal HTTP 200、重复 POST 的 200/202/terminal 语义，以及服务端 `deadlineAt/expiresAt`。
- [x] 确定 PostgreSQL queued row + immediate HMAC trigger + timer dispatcher + lease reaper 的 durable trigger 方案。
- [ ] 完成 Draft v2 第二次设计审批。

## Phase 1：Async foundation

### 后端与数据

- [ ] 扩展现有 `ai_analysis` 生命周期字段和唯一约束；如需 migration，先写 up/down 方案。
- [ ] 实现 `createVisionAnalysis` 原子创建：analysisId、`ai_analysis(created)` 和 quota reservation 同一事务完成。
- [ ] 让 `uploaded_assets.analysis_id` 建立稳定关联，并保存 sha256、尺寸、MIME 和对象状态。
- [ ] 扩展 Hybrid reserve/commit/release 为 analysisId 幂等 transition；旧 quota RPC 仅保留旧链路。
- [ ] 实现 worker claim、lease、CAS 状态转换和 stale-job reaper。
- [ ] 实现 `resume_stage=analyzing|enriching` 与 provider-success checkpoint。
- [ ] 区分 `deadline_at` 和 `expires_at`，由服务端 deadline 驱动 worker/reaper。
- [ ] 实现 GET `/vision-analysis/:analysisId`，只读且强制用户归属校验。

### 测试与 Gate

- [ ] schema migration forward/backward/readback。
- [ ] 并发相同 `clientRequestId` 只有一个任务和一次 reserve。
- [ ] commit/release 重复调用不重复扣 quota。
- [ ] worker crash、超时、重复 claim、重复 persistence。
- [ ] 旧 POST 合约、认证、越权读取、敏感字段扫描。
- [ ] Phase 1 artifact readback；feature flag 默认关闭。

## Phase 2：Hybrid fast-path fallback

### 后端

- [ ] 增加 capability negotiation；无 capability 的旧客户端不返回 202。
- [ ] 把 fast provider attempt 与 async provider attempt 拆成两个生命周期。
- [ ] fast timeout/transient error 只在 durable handoff 成功后返回 202。
- [ ] 实现 async worker 的 nutrition、evaluation、persistence 和 terminal quota transition。
- [ ] 保留当前 Diagnostic Instrumentation，增加 fast/async/handoff/attempt 字段。

### 前端

- [ ] 请求声明 `supportsAsyncVision`，处理 200、202 和 GET status。
- [ ] 建立 preparing/uploading/analyzing/enriching/processing/completed/failed 状态。
- [ ] 保存未完成 analysisId，支持页面重进和 App 前后台恢复。
- [ ] 将 Vision timeout 与真实 upload failure 分开映射。
- [ ] polling 退避、终态停止、登录失效和网络恢复处理。

### 测试与 Gate

- [ ] C1 类简单样本保持 200。
- [ ] 复杂样本触发 202 后由独立 worker 完成，结果 schema 与 200 一致。
- [ ] fast 成功、handoff 失败、worker 失败、provider 4xx/5xx、quota terminal 全覆盖。
- [ ] 真机后台/恢复/重复点击/网络瞬断 smoke。
- [ ] `clientRequestId → analysisId → traceId → jobId` 全链路可读回。
- [ ] 同一 production artifact SHA 完成受控部署后再开始 Phase 3。

## Phase 3：生产灰度

- [ ] 5% 灰度，观察 200/202、成功率、worker backlog、quota leak 和重复 persistence。
- [ ] 25% 灰度，观察 P95/P99、polling 请求量、旧客户端兼容和错误文案。
- [ ] 100% 前完成一次 rollback drill，验证 flag 关闭、worker drain 和未完成任务处理。
- [ ] 达到所有 acceptance gates 后才讨论 fast/async budget 是否需要单独变更。

## 明确停止点

本文件完成后停止。Draft v2 未通过第二次设计审批，不进入 Phase 1 编码、migration、部署或线上配置修改。
