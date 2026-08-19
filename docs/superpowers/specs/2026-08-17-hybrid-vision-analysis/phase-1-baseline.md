# Phase 1 Async Foundation Baseline

冻结状态：`PHASE 1 ASYNC FOUNDATION COMPLETE`

## Production baseline

| 项目 | 冻结值 |
| --- | --- |
| Environment | `lewis-healthy-d4glgqqzv73a5bc10` |
| Database migration | `0047_vision_async_foundation` |
| Hybrid feature flag | `false` |
| Dispatcher timer | 每分钟 |
| Reaper timer | 每分钟 |
| Production behavior | legacy synchronous only |
| HTTP 202 | disabled |

## Production artifact integrity

以下 SHA-256 按 CloudBase 实际生产打包边界计算：排除 `*.test.mjs`、`node_modules/**` 和 `.git/**`，并使用函数包内相同的相对路径规范化。

| Function | Production artifact SHA-256 |
| --- | --- |
| `get-login-ticket` | `e18f1f0cadc9f5653e431505fc64aa9d18716c7ee930e97217cc209d35727b3f` |
| `vision-analysis-worker` | `4a17b67a27c16ac175d642d1af86d44a950df8bb48570c78b478df91b1821d44` |
| `vision-analysis-dispatcher` | `453b110e84eb5aa1aef28e67a91db973de30320a7be5ad9479798784274590a7` |
| `vision-analysis-reaper` | `fc503a9d4e63103c8983ad36e69fbe48ac86771dcc28e25a4f5a53f824320740` |

## Scope boundary

Phase 1 does not enable Hybrid behavior, change the Vision timeout/budget, update the Mini Program, call Qwen from the foundation worker, or enter Phase 2.

Future CloudBase artifact comparisons must apply the production ignore/exclude rules before calculating SHA-256; a whole local directory fingerprint is not comparable to the deployed package.
