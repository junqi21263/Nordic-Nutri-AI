# PROD Trace 排查与小范围修复（2026-10-23）

## 读取范围与判断

目标：lewis-healthy-d4glgqqzv73a5bc10。读取最近 24 小时及 7 天请求 Trace，并另查 ai_analysis 异步任务；包含开发验证流量，不能解释为纯真实用户故障率。

- 最近 24 小时 HTTP Trace 没有 5xx。3 次 VISION_NON_FOOD 是内容拒绝；401 是未授权请求，不能凭此判定认证故障；1 次 FEATURE_USER_QUOTA_EXCEEDED 是配额策略拒绝，不绕过配额。
- 异步任务另有 1 次 timed_out / VISION_ASYNC_DEADLINE_EXPIRED，配额已释放，对应本会话此前失败的异步调度实验，不是发布后新增故障。
- 近 7 天：10 次 VISION_RETRYABLE，最新 10/22；7 次 /onboarding LOGIN_SERVICE_UNAVAILABLE，集中 10/19；3 次 DATABASE_P0001，集中 10/19；食材图片调度和提醒调度各 3 次，最新 10/21；3 次 FOOD_QUERY_INVALID，最新 10/19。
- 旧 onboarding / P0001 Trace 缺少底层异常，不能补造根因或宣称彻底修复。单字食物查询、部分数据库读取重试及 causeCode 保留已经在此前代码中修复，本次不重复修改。

## 本次可复现的问题与修改

1. Worker 的诊断事件包含 startedAt / durationMs，但接收 API 的 sanitizeTraceMeta 白名单缺少这两个字段。真实 PROD 指定测试任务的 metric meta 仅留下 stage/status 等字段。补回两个标量字段，其他敏感字段仍过滤。先加测试观察失败，再修改并通过。
2. 食材图片批次 dispatch 列表和计数读取已经有短暂数据库故障重试，但 processNext 候选项读取没有。复现 08006 导致该路径直接失败；复用 withDbReadRetry，最多重试一次只读查询。永久权限错误不重试，图片生成和更新操作不在重试块中。

## 分析口径

不要将 /vision-analysis 的 POST、任务状态 GET 和异步 Worker 混在一个 vision P95 中。状态 GET 往往只有百毫秒，会掩盖真实等待；HTTP 202 只表示已接收，不等于识别成功。历史丢失的 durationMs 不回填估算值。

下面的只读查询可区分任务提交与结果轮询：

```sql
select case
  when meta_json->>'method'='POST' and meta_json->>'route'='/vision-analysis' then 'submit'
  when meta_json->>'method'='GET' and meta_json->>'route' like '/vision-analysis/%' then 'poll'
  else 'other' end as phase,
  http_status, count(*) as requests,
  percentile_cont(0.5) within group(order by duration_ms) as p50_ms,
  percentile_cont(0.95) within group(order by duration_ms) as p95_ms
from public.ops_request_traces
where feature='vision' and started_at>now()-interval '24 hours'
group by 1,2;
```

异步任务应单独统计最终结果和创建至完成时间，且注明是服务端任务时间（不含客户端图片预处理、网络及轮询等待）：

```sql
select status,count(*) as tasks,
  percentile_cont(0.5) within group(order by extract(epoch from(completed_at-created_at)))
    filter(where status='completed' and dispatch_state='completed') as async_completed_p50_seconds,
  percentile_cont(0.95) within group(order by extract(epoch from(completed_at-created_at)))
    filter(where status='completed' and dispatch_state='completed') as async_completed_p95_seconds
from public.ai_analysis where created_at>now()-interval '24 hours' group by status;
```

阶段耗时用 ops_metric_events 中 metric=vision_async_execution_stage、status=succeeded 的 durationMs；失败阶段单独统计。worker.provider_start 目前包住识别及营养补全，不能把这一整个阶段声称为纯模型时间；纯模型时间另看结果 attempts.durationMs。

## 验证边界

858 项 PROD 后端回归通过，包含短暂连接恢复、持续失败的重试上限、权限错误不重试、无重复生成以及诊断敏感字段过滤。本次不修改数据库 schema、小程序或 APK，不主动运行生产提醒发送或食材图片生成。历史异常不清除，日志字段修复只影响后续事件。
