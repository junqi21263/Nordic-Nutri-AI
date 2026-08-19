# Production Readiness Actions

目标：在不扩大业务范围的前提下，把 Nordic Nutri AI 从当前 **NO-GO for Public Production** 推进到可审计的受控 Beta，再决定公开发布。

## Action Register

> **2026-08-19 execution update:** Final S2 production E2E and the independent S3 checkpoint-resume production fixture are PASS with database quota commit readback. Public release remains NO-GO because the worktree/artifact baseline, Mini Program async acceptance, privacy materials, and SRE evidence are not all closed.

| ID | Priority | Area | Problem | Evidence | Risk | Recommended Fix | Verification | Estimated Scope | Release Blocking |
|---|---|---|---|---|---|---|---|---|---|
| P0-1 | P0 | Release | 发布提交、函数 manifest 与实际 vision 函数集合不一致 | dirty worktree；`cloudbaserc.json` 未列 vision functions | 无法重建/回滚批准 artifact | 固化 clean commit、完整 manifest、统一 ignore/SHA 规则 | CI manifest + normalized SHA + deployment readback | M | Yes |
| P0-2 | P0 | Vision Async | 复杂图片 S2/S3 生产 E2E | S2 `202 → provider attempt #2 → completed → quota committed`；S3 checkpoint resume/no-second-provider 已有证据 | 仍需完整 rollout 验收 | 保留 recovery 与监控；转入客户端、并发和发布审计 | trace/job/quota/analysis 全链路 PASS | M | Yes |
| P0-3 | P0 | Client Contract | Mini Program 异步版本与后端/flag 没有同一发布基线 | 本地 async client 有代码；正式生产前端版本未独立证明 | 202/polling/reopen 行为不一致 | 绑定 client build、backend artifact、flag 和回滚版本 | 真机 200/202/GET/background/reopen | M | Yes |
| P0-4 | P0 | Privacy/Compliance | 微信审核、主体、政策、删除核验未形成证据包 | `WECHAT_RELEASE_CHECKLIST.md` 关键项未勾选 | 无法合规公开发布 | 完成平台声明、审核账号、删除/保留证明 | 审核材料和管理员只读回读 | M | Yes |
| P0-5 | P0 | SRE | 生产告警和值班演练缺失 | 未验证 5xx/timeout/p95/queue/quota/cost alerts | 事故无法及时发现或止损 | 配置阈值、接收人、runbook、回滚演练 | 触发测试告警并留证 | M | Yes |
| P1-1 | P1 | Performance | dispatcher/worker/AI 延迟分布未实测 | 仅有单次/截图 trace，缺少 p95/p99 和并发数据 | 并发扫描时队列和成本失控 | 小规模并发与 backlog 测试 | p50/p95/p99、error budget | M | Beta |
| P1-2 | P1 | Correctness | 重复 POST、provider attempt、quota transition 的生产并发证据不足 | 本地 CAS tests 通过，生产并发未验证 | 重复调用/重复扣费 | 双请求、重试、worker 重入测试 | analysis/provider/quota 唯一性 | M | Beta |
| P1-3 | P1 | Maintainability | `get-login-ticket` 职责过多 | 单文件/多领域 route/service coupling | 视觉改动影响 auth/meal/admin | 分阶段拆分 vision/observability | contract/regression/artifact tests | L | No |
| P2-1 | P2 | Tooling | Node 24 工具链与 CloudBase Node 18 runtime 矩阵未固定 | 本轮环境 Node 25.9.0，仓库要求 Node 24.18.x | 本地绿、生产运行时差异 | CI 固定 Node 24并验证函数 runtime | CI matrix + production smoke | S | No |
| P2-2 | P2 | Cost | provider 双 attempt、存储和日志成本无预算模型 | 日成本/单分析成本未验证 | 成本不可控 | 记录单分析成本和日预算告警 | 100/1k/10k DAU model + alert | M | No |
| P3-1 | P3 | Architecture | 未来规模增长可能受 timer/HTTP invocation 限制 | 当前依赖定时 dispatcher，容量未实测 | 高峰期延迟扩大 | 以实测 queue age 决定是否引入队列 | capacity review | L | No |

## Detailed P0 Actions

| 顺序 | 动作 | 验收证据 | 负责人/状态 |
|---|---|---|---|
| P0-1 | 固化单一发布提交和 artifact manifest | clean commit、函数清单含 vision dispatcher/worker/reaper、每个包 normalized SHA | PASS（HEAD `2a3b90a`、worktree clean、4/4 normalized SHA MATCH）；平台/审计记录仍需持续冻结 |
| P0-2 | 关闭或明确隔离生产 Hybrid flag，直到客户端/后端同版本 | flag readback、client build SHA、rollback proof | 生产 flag 已回读为 true；client build/rollback 仍未闭环 |
| P0-3 | 完成单样本 Final S2 E2E | `202 → claim → invoke → worker.entry → provider_attempt=2 → completed → quota=committed` | PASS（见 `docs/release-bundles/s2-e2e-2026-08-19.json`） |
| P0-4 | 完成 S3 checkpoint resume | `resume_stage=enriching`、Qwen second call=0、最终 completed | PASS；真实 Storage fixture 经独立 worker resume，`worker.checkpoint_resume`、`provider_attempt=1`、无 `worker.provider_start`、最终 completed/quota committed |
| P0-5 | 建立生产告警和值班证据 | 5xx、vision failure、p95、queue age、quota leak、cost 80% 告警演练 | 未完成 |
| P0-6 | 完成微信审核/隐私/删除证据包 | 主体、联系方式、版本/生效日期、权限声明、测试号、删除回读 | 未完成 |

## P1 — Limited Beta Blocking

- 完成两用户 ownership isolation、重复 POST/重试、保存幂等、弱网和 App background/reopen。
- 对 dispatcher claim delay、worker invoke duration、provider attempt、quota transition 建立 p50/p95/p99。
- 做受控并发测试，验证 `maxItems`、worker concurrency、数据库连接、provider 限流和队列公平性。
- 记录每分析成本和 provider attempt 上限，验证失败不会无限重试或双重扣费。
- 统一生产错误码：至少区分 `VISION_TIMEOUT`、`VISION_STATUS_INVALID`、`VISION_ASYNC_PROCESSING`、`VISION_ANALYSIS_STATUS_UNAVAILABLE`。
- 完成 Node 24 工具链与 CloudBase Node 18 runtime 的兼容/构建矩阵。

## P2 — Maintainability

- 把 `cloudbaserc.json` 变成所有函数、触发器、环境变量名称和 ignore/exclude 规则的单一来源。
- 将 `get-login-ticket` 的 vision controller、status route、dispatcher/reaper internal boundary 拆成独立可部署单元。
- 由 CI 自动生成 release bundle：commit、dirty check、test counts、artifact SHA、migration registry/readback、flag snapshot。
- 将设计文档的 `PASS/HOLD/PENDING` 状态纳入发布记录，不再依赖手工复制。
- 保留 sanitizer allowlist，并把敏感字段扫描变成 CI 必过门。

## P3 — Future Architecture

- 评估 CloudBase timer + HTTP invoke 是否足以支撑目标并发；若不能，迁移到明确的消息/任务队列。
- 将 provider adapter、nutrition/evaluation pipeline 和 persistence 编排拆成可观测 stage。
- 将 analysis timeline 统一为事件/attempt 记录，而不是把完整语义压在单行 `ai_analysis` 上。
- 增加 provider latency-aware routing、成本预算和按用户/日的动态限流。

## Recommended Execution Order

```text
1. 只读确认生产 flag、函数、触发器、migration registry、当前 backlog
2. 固化 clean release commit + manifest + normalized artifact
3. 保持 flag OFF，完成前端/后端版本一致性验证
4. 单样本 S2 controlled smoke，失败即 recovery
5. 单样本 S3 resume/no-second-Qwen

> **Transport/S3 update (2026-08-19):** The production dispatcher→worker transport path is directly evidenced, and a dedicated real-Storage fixture completed the checkpoint-resume path. The final S3 evidence is `worker.checkpoint_resume` with `providerAttempt=1`, no `worker.provider_start`, terminal `completed`, and committed quota. The synthetic transport-only fixture was terminalized separately with CAS and no quota mutation.
6. 并发/弱网/后台恢复/双用户 acceptance
7. 告警、成本、隐私、审核、删除核验
8. 邀请 Beta
9. 观察一个完整窗口后再决定灰度
```

## Do Not Do

- 不要用 prompt 修改掩盖 provider latency 或 dispatcher/invocation 问题。
- 不要在没有 E2E 证据时把 `202` 当作“后台一定接管”。
- 不要把函数 `Active / Available`、`CodeResult=success`、本地测试或截图当作完整生产验收。
- 不要在 dirty worktree 上计算 release SHA 或提交生产 artifact。
- 不要为 transport fixture 猜 user ID、复用未知用户或直接 INSERT 业务用户。
- 不要在 public rollout 前同时改 timeout、provider/model、图片策略和 Hybrid 逻辑。

## Exit Criteria

### Limited Beta

```text
clean release baseline                         PASS
production artifact/readback                   PASS
S2 E2E                                         PASS
S3 resume/no-second-provider                   PASS
old-client compatibility                       PASS
two-user isolation + GET read-only             PASS
weak network/background/reopen                 PASS
quota/CAS/idempotency under controlled load    PASS
alerts + rollback drill                        PASS
privacy/review/deletion evidence               PASS
```

### Public Production

在 Limited Beta 条件之上，再要求：

```text
灰度窗口无 P0/P1 incident
vision p95 / 5xx / queue age 在目标 SLO 内
成本预算和 provider rate limit 有实测余量
真实审核号和完整审核路径通过
生产值班和回滚责任人明确
```
