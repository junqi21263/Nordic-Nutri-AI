# API Contract

所有 Edge Function 使用 `POST /functions/v1/<name>`（health 为 GET）；成功和失败包络见 `mini-program/src/api/backend-contracts.ts`。Data API 的 CRUD 是稳定的 RLS 直连契约，尚未接入页面。

| 能力/页面 | 方法与路径 | 登录 | Edge | 请求/结果 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 微信登录/启动恢复 | POST `/wechat-login` | 否 | 是 | `{code}` → 会话 OTP/JWT | 占位：校验后 NOT_IMPLEMENTED |
| 当前用户 | GET `/auth/v1/user` | 是 | 否 | JWT → Auth user | Supabase 标准能力 |
| 个人资料/Profile 编辑 | GET/PATCH `/rest/v1/profiles` | 是 | 否 | ProfileInput → profile | 可用 RLS CRUD |
| 偏好/引导饮食页 | GET/PATCH `/rest/v1/user_settings` | 是 | 否 | 饮食模式、忌口、餐数、设置 | 可用 RLS CRUD |
| Body Profile | GET/POST `/rest/v1/body_profiles` | 是 | 否 | BodyProfileInput；POST 为新版本 | 可用、仅本人 |
| 健康目标 | GET/POST `/rest/v1/user_goals` | 是 | 否 | HealthGoalInput；POST 为新版本 | 可用、仅本人 |
| 餐食列表/记录页 | GET `/rest/v1/meal_records` | 是 | 否 | `date/meal_type/name ilike/limit/offset/order` | 可用；默认 `deleted_at=is.null` |
| 餐食详情/手工编辑 | POST/PATCH `/rest/v1/meal_records` | 是 | 否 | MealRecordInput header；`client_request_id` 去重 | 可用 |
| 餐食明细 | POST/PATCH/DELETE `/rest/v1/meal_items` | 是 | 否 | MealItemInput；触发器重算总量 | 可用 |
| 餐食归档 | PATCH `/rest/v1/meal_records?id=eq.<id>` | 是 | 否 | `{deleted_at}` | 可用；不硬删除 |
| 原子确认餐食 | POST `/save-meal` | 是 | 是 | MealRecordInput → record | 骨架；NOT_IMPLEMENTED |
| 上传/分析 | Storage upload；POST `/analyze-food` | 是 | 是 | `{objectPath,sha256}` → analysis | 骨架；NOT_IMPLEMENTED |
| 当前/历史计划 | GET `/rest/v1/nutrition_plans` | 是 | 否 | status/effective_from 分页 | 只读可用 |
| 生成/激活计划 | POST `/generate-plan` | 是 | 是 | `{bodyProfileId,healthGoalId}` → plan | 骨架；NOT_IMPLEMENTED |
| 教练会话/消息 | GET conversations/messages；POST `/coach-answer` | 是 | 是 | `{message,conversationId?}` → reply | 读取模型已建；回复骨架 |
| 首页汇总 | POST `/meal-summary` | 是 | 是 | `{date}` → totals/plan/progress | 骨架；NOT_IMPLEMENTED |
| 健康检查 | GET `/health` | 否（apikey） | 是 | service/status | 可用 |

错误码：`UNAUTHORIZED`、`FORBIDDEN`、`VALIDATION_ERROR`、`NOT_FOUND`、`CONFLICT`、`RATE_LIMITED`、`AI_SERVICE_ERROR`、`STORAGE_ERROR`、`DATABASE_ERROR`、`NOT_IMPLEMENTED`、`INTERNAL_ERROR`。客户端对网络/5xx/429 可重试；带 client_request_id 的写入可安全重试。
