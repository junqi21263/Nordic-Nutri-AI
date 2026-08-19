# Production Secret Rotation Runbook

状态：`PREPARED — EXECUTION REQUIRES PRODUCTION CHANGE APPROVAL`

本文件不记录任何 secret 原文、长度、摘要、token、URL 或函数详情输出。它只定义依赖关系、轮换顺序和验证条件。

## 依赖矩阵

| Secret family | Producer / verifier | Consumers | Rotation scope |
|---|---|---|---|
| Vision dispatch HMAC | `get-login-ticket` internal vision route | `vision-analysis-dispatcher`, `vision-analysis-reaper` | producer + both consumers together |
| Vision worker HMAC | `get-login-ticket` diagnostic/internal route | `vision-analysis-worker` diagnostic client and any configured internal caller | producer + all callers together |
| Shared worker HMAC fallback | `get-login-ticket` / legacy worker clients | only where the explicit fallback variable is still enabled | remove fallback after dedicated secret verification |
| Product session secret | `get-login-ticket` session service | authenticated client sessions and verification path | coordinated session invalidation required |
| WeChat app secret | `get-login-ticket` WeChat exchange | WeChat login exchange only | rotate only with WeChat platform confirmation |
| Identity hash pepper | `get-login-ticket` identity mapping | stored identity fingerprints | do not rotate casually; requires migration design |

The actual production variable names are intentionally omitted from this public-facing runbook. The deployment operator must resolve them from the approved function configuration inventory, not from logs or copied function detail output.

## Required sequence

1. Capture a presence-only baseline for every affected function. Do not export values.
2. Generate new random values in the approved secret manager.
3. Stage the new values on every producer and consumer that verifies the same signature. Do not rotate one side first.
4. Deploy/reload the affected functions in a bounded window while Hybrid behavior remains unchanged.
5. Run presence-only configuration readback and an authenticated internal transport probe using the new values.
6. Verify the old values are rejected by the relevant internal HMAC endpoints. Do not record the old or new value.
7. Confirm S2/S3 terminal and quota invariants remain unchanged; do not create a new business analysis for the rotation check.
8. Revoke/delete the old values in the secret manager and record the rotation timestamp, owner, and release commit.

## Stop conditions

Stop and restore the previous known-good configuration only through the approved rollback procedure if any of the following occurs:

- internal signature verification fails;
- dispatcher/worker transport smoke is not successful;
- authenticated legacy Vision returns a new error;
- any quota, lease, or terminal state changes outside the approved fixture;
- a readback contains secret material;
- the dependency mapping is incomplete.

Do not use a shared fallback secret to bypass a failed dedicated-secret check.

## Evidence required to close P0-6

```text
affected secret families mapped                 PASS
presence-only pre-rotation readback             PASS
new values provisioned through approved manager PASS
all consumers reloaded                          PASS
new-value internal probe                        PASS
old-value invalidation probe                    PASS
no secret leakage in logs/bundle                 PASS
S2/S3 and quota invariants unchanged            PASS
rotation owner/timestamp/commit recorded        PASS
```

Until all rows are evidenced, P0-6 remains `NOT VERIFIED` and public release remains `NO-GO`.
