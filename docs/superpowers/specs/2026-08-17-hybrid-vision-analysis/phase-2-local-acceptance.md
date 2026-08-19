# Phase 2 Hybrid Vision — Local Acceptance Package

日期：2026-08-18

## Scope

本包只记录 Phase 2 的本地实现与验证证据。生产 migration、函数部署、Hybrid flag enablement、真实 Qwen async smoke 均未执行。

冻结项保持不变：Flash 6000ms、server 12500ms、client 15000ms、JPEG/HEIC 策略、provider/model、nutrition strategy、meal save flow。

## Implemented locally

- fast success：HTTP 200，保留同步结果路径。
- fast provider timeout / transient failure：仅在 durable handoff 接受后返回 HTTP 202。
- provider success + downstream budget 不足：checkpoint 后以 `resume_stage=enriching` handoff；worker 不再调用 provider。
- handoff failure：不返回虚假 HTTP 202。
- `clientRequestId` / `analysisId` 复用路径：completed、processing、terminal 任务不重复调用 provider。
- POST capability negotiation：只有 feature flag 与 `supportsAsyncVision=true` 同时满足时才进入 Hybrid。
- GET status：按 owner 读取、无 quota/provider/persistence 副作用。
- Mini Program：支持 200/202、polling、退后台/重进恢复、稳定错误映射。
- fast→async 与 provider checkpoint 使用 version/CAS RPC authoring。
- worker processor：`analyzing` 进行一次独立 async provider attempt；`enriching` 复用 checkpoint。

## Verification evidence

| Gate | Result |
|---|---|
| Backend focused tests | PASS — 96/96 |
| Hybrid controller tests | PASS |
| CAS migration authoring test | PASS |
| Mini Program async tests | PASS — 3/3 |
| Mini Program TypeScript | PASS |
| Mini Program lint | PASS |
| WeChat production build | PASS |
| WXSS compatibility check | PASS |
| `git diff --check` | PASS |

## Explicitly not accepted yet

- `vision-analysis-worker` 已完成本地 production-shaped wiring：通过 runtime service 接入 foundation claim/CAS、已上传图片临时 URL、Qwen、nutrition/evaluation/persistence 和 quota terminal transition；默认仍 disabled。
- 未执行 0048 production migration。
- 未部署任何 Phase 2 artifact。
- 未启用 `VISION_ASYNC_FOUNDATION_ENABLED` 或任何 Hybrid flag。
- 未让真实客户端收到 202。
- 未做真实 provider async attempt、真机后台恢复、生产 trace correlation smoke。

## Gate status

```text
Phase 2 local implementation       PASS
Local acceptance package           PASS
Production migration               HOLD
Production deployment              HOLD
Hybrid feature enablement          HOLD
Real-device / provider smoke       PENDING
```

下一步是对 0048 migration 和 worker artifact 做独立的 Production Migration / Deployment Gate；本包不授权任何生产写入或发布动作。
