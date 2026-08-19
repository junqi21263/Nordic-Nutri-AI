# Nordic Nutri AI Production Readiness Audit

审计日期：2026-08-19（Asia/Shanghai）
审计范围：仓库当前工作树、已有发布记录、现有真机/生产证据、CloudBase 目标环境声明。
审计模式：只读审计；本轮不修改业务代码、不执行 migration、不部署函数、不改变生产配置或 feature flag。

## 2026-08-19 Execution Addendum

本文件的早期结论记录在 S2 生产闭环完成前；以下为本轮之后的权威增量证据，优先于同文件中的旧状态描述：

- Final S2 已通过：`HTTP 202 → resume_stage=analyzing → dispatcher claim/invoke → worker provider_attempt=2 → completed → quota_state=committed`。
- 生产数据库回读确认同一 `client_request_id` 只有 1 条 analysis，`lease_until=null`、`execution_owner=none`、`dispatch_state=completed`。
- S3 独立真实 Storage fixture 已完成 async-worker enriching resume：`worker.checkpoint_resume` 成功、`provider_attempt=1`、无 `worker.provider_start`，最终 `completed` 且 quota committed。
- 当前四个 Hybrid flag 均为 `true`；这证明受控链路已开启，不等于公开 rollout 已批准。
- 当前可重建 release candidate 已更新为 `docs/release-bundles/production-release-candidate.json`，其 source commit 为 `6fbde98620034bdb29c48d7b47a8900491c6d8bd`，worktree 在生成时 clean；candidate 包含 9 个函数、Vision dispatcher/worker/reaper trigger contract、生产 ignore 规则和当前 normalized SHA。
- 隐私审核材料自动门禁已通过 `11/11`；微信公众平台截图已证明用户隐私保护指引已更新且 UGC 场景已声明，但自动门禁和截图仍不替代真实主体、联系方式、删除回读和审核责任人确认。
- 当前 worktree 已 clean；四个 `$LATEST` 生产包已按同一 ignore 规则完成 normalized SHA `4/4 MATCH`。平台 `codeSha256` 仍作为独立 digest domain 记录。
- 隐私审核材料仍为 `DRAFT — OWNER INPUT REQUIRED`；新增平台截图证明个人主体已认证、小程序已备案，专用审核账号标识 `junqi21263` 已提供，但成员资格、完整法定名称、联系方式和删除回读仍未证明。
- 2026-08-19 只读平台回读：目标环境 `lewis-healthy-d4glgqqzv73a5bc10` 状态 NORMAL，PG RUNNING，套餐 `baas_personal`，自动续费开启，到期时间 2026-09-03 23:59:59；dispatcher `$LATEST` timer 为 `*/15 * * * * * *`，reaper `$LATEST` timer 为 `0 * * * * * *`，两个触发器均 BindStatus=on / Enable=1。
- 2026-08-19 migration runner 回读：`20260815224412 repair_core_schema_drift`、`20260818000000 vision_hybrid_runtime_reconcile`、`20260819000000 transport_fixture_rpc`、`20260819000001 vision_quota_expiry_reconcile`，LatestVersion=`20260819000001`。

## Executive Summary

结论：**NO-GO for Public Production**。

当前产品已经具备可用的基础视觉能力：真实设备上曾完成餐食图片上传、菜品识别、营养结果展示、保存本餐和记录页回读；本地自动化质量也较好。复杂餐食超过 Flash 6 秒后的 S2 异步兜底，以及 provider 成功后的 S3 checkpoint resume/no-second-provider，均已有受控生产证据；但仍未形成可公开发布的完整基线与客户端、运维、合规闭环。

同时，Mini Program 异步客户端的正式生产发布证据缺失，生产 Hybrid flag 虽已独立回读为 `true`，但客户端版本与灰度范围尚未形成可审计的单一发布基线。

建议：

1. 公开生产：**NO-GO**。
2. 受控内部/邀请 Beta：仅在 Hybrid flag 明确关闭、仅使用已验证的同步客户端、并完成固定回滚和告警证据后，最多 **CONDITIONAL GO**。
3. 不能把后端 S2/S3 通过表述为整个产品已完成公开发布；客户端真机异步恢复、并发、告警、回滚和合规证据仍需独立关闭。

## Evidence Standard

- `PASS`：有可复核的代码/测试/部署/真机或生产证据，且证据直接覆盖结论。
- `PARTIAL`：一部分链路通过，但仍有关键边界未覆盖。
- `NOT VERIFIED`：只有设计、静态代码、历史记录或口头确认，没有当前可复核证据。
- `FAIL`：存在直接反例。
- “代码存在”不等于“已部署”；“函数 Active”不等于“真实链路成功”；“本地测试通过”不等于“生产容量或真机通过”。

## System Architecture

```text
WeChat Mini Program (Taro/React/TS)
        |
        | wx.login / signed product session / HTTPS JSON
        v
CloudBase HTTPS function: get-login-ticket
        |
        | PostgreSQL API key stays server-side
        | auth, meal, quota, vision, trace and admin routes
        +--> Qwen Vision Flash/Plus
        +--> storage upload / temporary URL
        +--> nutrition / evaluation / persistence
        +--> PostgreSQL ai_analysis, uploaded_assets, quota
        |
        +--> durable async path (intended)
              queued row -> dispatcher -> vision-analysis-worker
                         -> reaper / CAS / quota terminal transition

Admin Hosting: cloudbase/admin/food-images.html
PG migrations: cloudbase/pg/migrations/
```

主要模块与边界：

| 模块 | 当前证据 | 审计判断 |
|---|---|---|
| Mini Program | Taro build、532 tests、typecheck、lint 通过 | 本地质量通过；生产前端版本未独立证明 |
| `get-login-ticket` | 统一 HTTPS/auth/API/AI 边界；代码约 3,000+ 行 | 已运行但耦合度高，需拆分/固化发布边界 |
| Vision foundation/hybrid | 本地实现、CAS、checkpoint、deadline tests；生产 S2/S3 受控 fixture | 后端核心链路通过；客户端和发布审计仍未闭环 |
| Dispatcher/worker/reaper | 独立函数目录、生产 manifest/trigger contract 和定向测试 | 生产 artifact/readback 已有证据；并发容量与持续 SLO 仍未闭环 |
| PostgreSQL | 0047-0051 SQL/readback/rollback tests；0051 真实 PG 验证 | 生产 registry 已回读至 `20260819000001 vision_quota_expiry_reconcile`；CAS/配额 fixture 与 quota 一致性回读已通过 |
| Observability/Admin | Trace Explorer、sanitizer、system health | 有基础能力；告警和持续 SLO 证据不足 |

## Release Scorecard

| Gate | 结果 | 依据与缺口 |
|---|---|---|
| 1. Architecture | PARTIAL | 设计、模块和数据流清楚；timer-only dispatch 延迟与容量仍缺少实测 |
| 2. Core Functions | PASS（后端） | 真机识别/营养/保存通过；S2 fallback 和 S3 checkpoint resume 已有生产受控证据，完整产品发布仍未关闭 |
| 3. Frontend | PARTIAL | 532 tests、typecheck、lint、build、WXSS/size 通过；异步 polling/后台恢复生产真机和正式上传未验证 |
| 4. API Contract | PARTIAL | auth/legacy/ownership/read-only 有证据；曾出现 `VISION_STATUS_INVALID`，202 客户端合约未完成生产闭环 |
| 5. Backend | PASS（核心链路） | 目标后端测试与生产 S2/S3 受控 fixture 通过；并发/容量证据仍缺失 |
| 6. Database | PASS（当前迁移链） | 0047-0050 本地测试通过；生产 registry 已回读，CAS/配额 fixture 已通过 |
| 7. AI/Provider | PARTIAL | Qwen 成功样本存在；延迟波动和复杂图超时持续出现，provider retry/成本上限未生产证明 |
| 8. Performance/Capacity | NO-GO | 生产 trace 多为 7.2–9.2s flash 失败/超时；没有并发、队列、p95/p99、压测或容量模型 |
| 9. Security | PARTIAL | HMAC、auth、sanitizer 有本地测试；生产互调权限、密钥轮换和完整外部安全审计未验证 |
| 10. Privacy/Compliance | NO-GO | 隐私页面存在，但 release checklist 的主体/联系方式/微信平台声明/审核材料仍是未勾选项 |
| 11. Observability/SRE | PARTIAL | Trace/metric/processing 状态修复已实现并有测试；告警接收人、阈值、演练和可检索性未闭环 |
| 12. Deployment/Release/Rollback | PARTIAL | 四个 `$LATEST` 生产包 normalized SHA `4/4 MATCH`，并回读 Active/Available、CodeResult=success；当前候选已绑定 source commit `6fbde98`，客户端绑定和 rollback drill 仍未完成 |
| 13. Testing | PARTIAL | 本地测试和构建强；生产 authenticated concurrent/async/old-client/device matrix 未完成 |
| 14. Maintainability/Evolvability | PARTIAL | 测试覆盖较好；`get-login-ticket` 过大、runtime coupling、未提交变更和多套历史设计增加风险 |
| 15. Cost Control | NO-GO | provider 双 attempt、存储、日志和日预算告警尚无生产实测与演练证据 |

综合评分：**58/100（Conditional engineering readiness；不是 public release score）**。扣分主要来自生产证据缺口，而不是本地功能代码缺口。

## Release Blockers

### P0 — 必须在公开生产前关闭

1. **复杂图片异步兜底已完成后端生产 E2E，但完整发布仍未闭环**：S2 已有 `Flash timeout → 202 → worker provider attempt #2 → completed → quota committed`；S3 已有 `checkpoint → worker.checkpoint_resume → no provider_start → completed → quota committed`。剩余是客户端真机、并发、SRE 和发布审计。
2. **客户端与生产发布一致性仍未闭环**：后端 clean commit 和四个 normalized SHA 已闭环，但 Mini Program 正式版本、灰度范围和回滚绑定仍未形成可审计证据。
3. **客户端与后端合约不同步风险**：本地已实现 200/202/polling，但 Mini Program 正式发布/体验版版本和生产后端 artifact 的同一 SHA/版本关联未验证。Hybrid flag 若确实保持 ON，会把未完成的异步链路暴露给新客户端。
4. **公开发布的隐私、审核和运营证据未完成**：`docs/WECHAT_RELEASE_CHECKLIST.md` 中关键项目仍未勾选；这不是代码测试可以替代的合规门。
5. **生产敏感配置需要轮换并重新核验**：一次函数详情回读包含敏感环境值；原文未写入发布包或本报告，但公开上线前必须轮换受影响 secret、确认最小权限，并验证 readback 只返回 presence/脱敏摘要。

### P1 — 受控 Beta 前必须关闭或明确豁免

- 生产 trace 仍显示 provider/fast stage 常在 7–9 秒失败或超时；Hybrid 后端已有兜底，但体验延迟分布仍未完成实测。
- dispatcher 的定时补偿路径存在显著等待和历史 invocation boundary 风险；没有稳定的生产 latency distribution。
- 没有公开 rollout 的 5xx、视觉失败率、p95、queue age、quota leak、日成本告警演练证据。
- 没有双用户/旧客户端/弱网/后台恢复/重复点击的当前生产矩阵报告。
- `get-login-ticket` 过大且承担过多领域职责，任何视觉改动都会扩大 auth/meal/admin 回归面。

### P2 — 发布后必须排期

- 将 vision 路由、异步控制器、observability 和 admin diagnostics 从主函数逐步拆出。
- 建立正式 CI：Node 24.18.x、artifact normalization、manifest completeness、migration registry/readback、test reports。
- 建立 provider 成本预算、attempt 上限、队列 backlog 和按用户/日限流的统一看板。

### P3 — 长期改进

- 统一错误码/HTTP 状态到公开契约文档。
- 统一 trace schema、字段命名和状态映射，避免历史 `processing` 被误算失败。
- 进一步压缩图片和改进拍摄引导，但不要把输入优化当成异步可靠性的替代品。

## Functional Audit

### A. 已验证

- 真机/体验路径曾成功完成餐食图片上传、主要菜品识别、营养结果展示。
- “保存本餐”成功提示出现，记录页可看到餐食及营养汇总变化。
- 本地 legacy persistence 已修复为 `completed`，`analysisId` 与 `ai_analysis.id` 契约测试通过。

### B. 未关闭

- 复杂餐食真实请求仍可出现 `VISION_TIMEOUT`（用户提供的真机/Trace Explorer 证据）。
- S2 最终成功已验证；S3 resume completion/no-second-Qwen 已通过受控真实 Storage fixture 验证。仍需完成客户端真机异步恢复、并发和发布审计闭环。
- 连续点击、超时重试、多个用户并发的生产级唯一性和 quota 不重复扣费未形成当前报告。

## Frontend Audit

已通过：`pnpm --dir mini-program test:unit`（138 files / 532 tests）、typecheck、lint、生产 WeChat build、WXSS compatibility、package size（1.129 MiB / 1.717 MiB）。异步状态轮询对瞬时网络/状态读取失败增加了有界重试；确定性状态错误仍立即失败。

未验证：正式体验版/审核版是否包含当前 `vision-async-client.ts`；真机 202 页面、轮询、切后台、退出扫描页、重进和弱网恢复；旧客户端收到旧错误合约；多设备并发。

## API Audit

当前代码通过 `clientCapabilities.supportsAsyncVision` 与服务端 flag 双条件进入 Hybrid（`cloudbase/functions/get-login-ticket/index.js:3176-3185`）。GET status route 在 flag off 时返回 404（同文件 `:1900-1914`），这是设计选择但必须与客户端/发布策略一致。API 仍需补齐：202/processing 的公开 schema、error mapping、重复 POST、超时后 recovery、旧版本兼容和跨用户拒绝的当前生产报告。

## Backend Audit

本地 backend focused tests、HTTP route tests 和 worker/dispatcher tests 通过；生产 dispatcher→worker invocation、S2 provider attempt #2、S3 checkpoint resume 和 quota terminal readback 已有当前可复核证据。并发容量、真实故障恢复演练和长期 SLO 仍未关闭。

## Database Audit

本地 migration tests 0051 相关链路与既有迁移回归通过，覆盖 0047 foundation、0048 hybrid runtime、0049 reconciliation、0050 transport fixture RPC、0051 quota expiry reconciliation 的静态/幂等/非破坏性断言；一次性 PostgreSQL 16 真实 up/readback 亦通过。

当前生产 registry 已回读包含 `20260819000001 vision_quota_expiry_reconcile`；dispatcher→worker transport、S2/S3 受控 fixture、CAS/配额 terminal 状态和过期 reservation 一致性已有证据。仍未验证的是持续队列 backlog、并发租约行为、容量上限和长期 provider 成本。

## AI / Provider Audit

Qwen Flash 有成功样本，故不是“provider 永远不可用”。但生产 trace 中 flash 阶段多条记录耗时约 7.2–9.2 秒并显示失败/超时；这证明 provider latency 与同步 6 秒边界存在现实冲突。Prompt 微调不能从根本上保证 latency，也不能替代 durable async completion 验证。

## Performance Audit

当前没有可复核的：并发用户数、函数并发配额、dispatcher batch fairness、queue age p50/p95/p99、provider rate limit、storage bandwidth、DB connection pool、峰值成本。尤其是“后续用户同时扫描”尚未完成容量和隔离验证，因此公开发布不通过。

## Security Audit

本地测试证明了认证、HMAC-before-auth、fail-closed fixture provisioning、敏感字段 sanitizer、服务端密钥边界等若干控制；未发现本轮源码中客户端直接持有 DB/API key 的证据。一次函数详情回读包含敏感环境值，原文未进入 bundle；仍需完成生产密钥轮换/回收、HMAC 独立 secret 归属、最小权限、函数互调权限、审计访问控制和外部攻击测试。

## Privacy Audit

代码包含隐私政策、免责声明和账号注销页面，但发布清单仍明确要求产品主体、有效联系邮箱、生效日期/版本、微信平台隐私声明、审核测试账号、HTTPS 域名、删除核验等。由于这些不是仓库静态测试可以证明的事项，本 Gate 只能 `NO-GO`。

## Observability Audit

Trace Explorer、processing 状态、stage timing、provider timing 和 sanitized diagnostic package 已存在；本地观测测试通过。近期修复了 `processing` 被 normalize 成失败的显示问题，但无法改变历史 trace，也没有当前可验证的告警演练、值班责任人、SLO、错误预算或成本告警。用户提供的 Trace Explorer 截图仍显示大量 flash 失败/超时，因此看板本身已经暴露真实稳定性风险。

## Deployment Audit

仓库要求 Node 24.18.x，本轮本地命令仍需在目标工具链上复核。当前 release baseline worktree clean；`cloudbaserc.json` 已列出 vision dispatcher/worker/reaper。四个 `$LATEST` 生产包按相同生产 ignore 规则完成 normalized SHA `4/4 MATCH`，并回读为 Active/Available、CodeResult=success。客户端正式版本绑定、rollback drill 和公开 rollout 仍未关闭。

## Testing Audit

本轮可复核结果：

| 检查 | 结果 |
|---|---|
| root initialization | PASS 3/3 |
| Mini Program unit | PASS 532/532 |
| Mini Program typecheck | PASS |
| Mini Program lint | PASS |
| WeChat build | PASS |
| WXSS/size | PASS |
| backend functions (get-login-ticket/dispatcher/worker/reaper) | PASS 575/575（在允许本地监听的环境重跑） |
| PG migration tests | PASS 47/47 |
| manifest/schema/init tests | PASS 16/16 |
| `git diff --check` | PASS |

测试强度是本项目的优势；限制是多数测试为本地 mock/fixture，不能替代真实 CloudBase、Qwen、Storage、并发和真机证据。

## Maintainability Audit

优点：测试命名清晰、CAS/状态词汇显式，迁移有 readback/rollback 文件，敏感字段有 sanitizer；本轮已固化 clean release baseline、manifest 和 normalized artifact SHA。剩余风险：主 HTTP 函数职责过多；生产客户端版本、secret 轮换、SRE/隐私证据和并发容量仍未闭环；多个设计文档仍保留历史 HOLD/PENDING 状态，发布时必须以最新 release evidence 为准。

## Scalability Audit

### Scalability

当前没有压测、峰值并发、队列延迟、数据库连接、provider 限流或 worker 扩缩容证据。当前生产 dispatcher timer 为 15 秒、reaper 为 1 分钟；仍必须建立受控并发测试和 backlog 告警，不能只按 timer 配置推断实际 p95。

## Cost Audit

双 provider attempt、营养/评估补全和失败重试可能放大成本。当前没有经验证的单分析成本、日预算、模型 token 预算、按用户成本上限或 80% 告警演练。Cost gate：`NOT VERIFIED`。

## Failure Mode Analysis

| 失效模式 | 影响 | 当前控制 | 残余风险 | 等级 |
|---|---|---|---|---|
| Flash 超时 | 用户看到识别失败 | Hybrid S2 fallback、recovery、quota/CAS | 客户端与容量/SLO仍未闭环 | P1 |
| dispatcher 未及时 invoke worker | 任务过期、quota 长时间 reserved | deadline、reaper、诊断事件、已验证 transport | 生产延迟分布未证明 | P1 |
| worker 重复 provider | 成本/结果重复 | CAS、attempt 字段、S3 no-second-provider evidence | 并发生产未证明 | P1 |
| 202 与客户端版本不匹配 | 用户卡在处理中 | capability negotiation | 前端正式发布未证明 | P0 |
| quota 状态漂移 | 配额错误/成本失控 | terminal RPC、幂等测试 | 并发生产未证明 | P1 |
| trace 把 processing 算失败 | 运营误判 | 本地已修复 | 历史数据/生产读回需复核 | P1 |
| provider latency spike | p95/体验恶化 | timeout 和 fallback 设计 | 没有容量/SLO控制 | P1 |

## Technical Debt

1. `get-login-ticket` 作为多领域 god function。
2. 生产函数声明、实际函数目录、artifact 计算规则没有单一来源。
3. 设计、local acceptance、production history 的状态文件没有自动同步。
4. 生产证据依赖人工截图/口头 Gate，缺少自动化 release bundle。
5. Trace schema 与业务 status 曾发生 `processing`/failure 语义漂移。
6. Node 18 CloudBase runtime 与仓库 Node 24 工具链的兼容矩阵未固定。

## Release Decision

```text
Public Production       NO-GO
Limited Beta             CONDITIONAL GO ONLY
Hybrid Feature Flag     MUST NOT be considered release-ready without current E2E evidence
Core Vision Recognition PASS for verified simple/ordinary samples only
Complex Timeout Fix     NOT CLOSED
```

## Limited Beta Verdict

当前结论：**CONDITIONAL GO ONLY**。仅允许专用测试身份和邀请用户，且必须满足以下条件：

- 仅专用测试身份/邀请用户；明确记录环境、artifact SHA、flag、client build。
- Hybrid 默认关闭，除非完成单样本 S2 E2E，并具备一键关闭与过期任务 recovery。
- 先完成隐私/审核清单、告警、回滚和数据删除核验。
- 完成至少双用户、重复 POST、弱网/后台恢复、并发小压测。

## Public Production Verdict

当前结论：**NO-GO**。除 Limited Beta 条件外，还必须满足：

- 生产 S2/S3 completion 已 PASS；仍必须完成 old-client compatibility、Mini Program 真机恢复、并发和发布审计。
- manifest/CI/commit/artifact/部署记录闭环。
- 5xx、视觉失败率、p95、queue age、quota leak、成本告警和负责人可验证。
- 发布审核、隐私主体/联系方式/版本、生效日期和注销删除证据齐全。

## 30/60/90 Day Roadmap

### 0–30 天：关闭上线阻塞

- 固化 manifest，纳入 vision 函数、触发器、runtime、ignore 规则和 artifact SHA。
- 在不改业务语义的前提下完成 Transport Smoke、Final S2、S3 resume/no-second-Qwen。
- 产出真实生产 release bundle：commit、四/实际函数 SHA、flag、migration registry、测试和回滚证据。
- 完成告警/值班/成本阈值和隐私审核材料。

### 31–60 天：受控稳定性

- 做小规模并发和队列公平性测试，得到 p50/p95/p99。
- 把 provider attempt、queue age、worker invoke、quota transition 纳入统一 dashboard。
- 拆分 `get-login-ticket` 的 vision/observability 边界，降低回归面。

### 61–90 天：公共扩展

- 以小比例灰度启用 Hybrid，按错误预算自动回退 flag。
- 加入成本预算、按用户限流、provider fallback 策略和容量演练。
- 评估将异步任务迁移为更明确的队列/事件系统，减少定时器延迟依赖。

## Architecture Verdict

当前架构方向正确：同步快路径 + PostgreSQL durable state + CAS/lease + 独立 worker/reaper 已在受控生产样本上证明能解决“客户端同步 deadline 小于 provider latency”的结构性问题。下一阶段不是继续堆 prompt，而是完成客户端恢复、并发容量、告警、成本、隐私和可回滚发布基线。

### 评分（1–10）

| 维度 | 分数 | 依据 |
|---|---:|---|
| 当前架构 | 7/10 | durable state、CAS、lease、worker/reaper 方向正确；函数边界仍较大，但部署 manifest 已固化 |
| 可维护性 | 6/10 | 本地测试较强；`get-login-ticket` 过大、secret 轮换流程和多套状态文档增加维护成本 |
| 可迭代性 | 6/10 | provider/状态扩展有抽象；跨主函数、PG、前端和 flag 的变更面仍大 |
| 可扩展性 | 5/10 | 设计可支撑受控增长；没有生产容量、队列延迟和成本实测 |
| 稳定性 | 6/10 | S2/S3 后端受控生产链路通过；并发、p95/p99、客户端恢复和告警演练不足 |
| 安全性 | 7/10 | auth/HMAC/RLS/sanitizer 有较好本地证据；生产权限、轮换和外部测试未完成 |
| Observability | 6/10 | trace/stage/processing 修复存在；告警演练、SLO、值班和历史数据治理不足 |

## 2026-08-19 Quota Consistency Addendum

- Production read-only evidence initially found one terminal `timed_out` analysis with `quota_state=reserved`; its linked reservation was `state=expired` while `reservation_state` remained `reserved`.
- Root cause is the existing automatic expiry function updating reservation `state` only, without synchronizing `reservation_state` and `ai_analysis.quota_state`.
- Local forward-only migration `0051_vision_quota_expiry_reconcile` and 3/3 static contract tests are present. A disposable PostgreSQL 16 validation passed for existing stale-row reconciliation, live expiry synchronization, readback, and idempotency; production migration was executed through the official runner.
- 0051 production push succeeded through the official runner; registry/readback now show the migration present, stale expired reservations `0`, and terminal-reserved quota rows `0`. No business row was manually mutated and no expired reservation was restored to `reserved`.

## Future Architecture (6–12 Months)

| 规模 | 建议 |
|---|---|
| Now | 保持 CloudBase HTTPS + PG + Storage + 独立 worker/reaper；先闭合发布、S2/S3、告警和成本证据 |
| 1k DAU | 量化 queue age、provider p95、DB connection、函数并发和每日成本；必要时增加可靠 immediate trigger，但不提前引入微服务 |
| 10k DAU | 若 timer/HTTP invocation 成为瓶颈，再引入明确任务队列或托管消息服务；按领域拆分 vision 与 auth/meal |
| 100k DAU | 重新评估 provider routing、队列分片、读写扩展、冷热图片存储和独立 observability；以实测瓶颈为依据，不预先引入 Kafka/Kubernetes/CQRS |
