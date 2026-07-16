# Database Schema

所有 public 业务表启用 RLS，主键 UUID，时间为 timestamptz，并由 `set_updated_at` 触发器维护。用户归属均为 `users(id)`/`auth.uid()`；private.wechat_identities 不暴露 Data API。

| 表 | 关键字段/关系 | 生命周期与索引 |
| --- | --- | --- |
| users, profiles | Auth 一对一；昵称、头像路径、时区 | auth trigger 自动创建；仅本人读/改 profile |
| user_settings | 饮食模式、忌口数组、餐数、语言/单位/通知/主题 | 每用户一行，RLS 本人读改 |
| body_profiles | 年龄/性别/身高/体重/活动量/训练日、is_current | 版本记录；`(user_id) where is_current` 唯一，`user_id,effective_at` |
| user_goals | 目标类型、目标体重/日期、is_current | 版本记录；每用户一条 current |
| nutrition_plans, health_plan_items | 计划引用目标和身体快照；版本、状态、激活/归档；分餐项 | 一个用户一条 active；计划项 `(plan,sequence)` 唯一 |
| food_catalog | 标准食品及每 100g 营养 | 用户只读 active；别名 GIN 索引 |
| uploaded_assets, ai_analysis | 私有对象元数据；分析草稿关联 asset、hash、请求幂等 | `(bucket_id,object_path)` 唯一；分析不与最终餐食混淆 |
| meal_records, meal_items | 餐次及用户确认的数量/营养快照 | `client_request_id` 每用户唯一；明细触发器重算总量；`deleted_at` 软删除 |
| coach_conversations, coach_messages | 会话与消息两级；role/content/status | 会话按 `(user_id,last_message_at)`；消息按 conversation 游标分页 |

餐食采用软删除/归档，不做物理删除；列表必须 `deleted_at=is.null`。首页在 Phase 1 从未删除餐次实时汇总，`daily_health_summaries` 仅在性能数据证明必要时引入。

RLS：profiles/settings/body/goals/assets/计划/会话均用 `(select auth.uid()) = owner`；meal_items 通过所属 meal_records 的 owner 判定。INSERT 与 UPDATE 均有 `WITH CHECK`，UPDATE 同时有 SELECT/USING；跨用户读写返回空或拒绝。Storage bucket `food-images` 私有，首级目录必须等于 uid；仅 jpeg/webp、5MB，禁止客户端 upsert。
