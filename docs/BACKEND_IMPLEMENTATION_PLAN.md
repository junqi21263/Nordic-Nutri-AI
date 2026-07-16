# Backend Implementation Plan

| 阶段 | 范围/文件 | 测试与验收 | 风险/依赖 |
| --- | --- | --- | --- |
| 1 认证和基础资料 | Auth 投影、profiles、user_settings、wechat-login skeleton | 未登录/本人/跨用户 RLS；资料更新 | 真实微信 App Secret 与生产 Auth 策略待配置 |
| 2 身体档案与目标 | body_profiles、user_goals、版本触发器 | current 唯一、历史保留、边界参数 | 产品需确认后续独立体重趋势页 |
| 3 餐食 CRUD | meal_records/items、重算触发器、软删除、分页 | 创建/改/删、重复提交、日期筛选、跨用户拒绝 | Data API 列表必须默认过滤 archived |
| 4 图片与 AI 餐食识别 | bucket/assets/ai_analysis/analyze-food | 文件类型/所有权/函数校验 | AI provider、成本、内容安全、清理任务 |
| 5 AI 健康计划 | plans/items/generate-plan | 版本、激活、幂等 | 公式与医学免责声明待产品确认 |
| 6 教练对话 | conversations/messages/coach-answer | 游标分页、重试、敏感内容策略 | Prompt、配额、AI 失败降级 |
| 7 首页汇总 | meal-summary 或受控聚合 | 今日餐食、宏量、计划进度 | 先实时，容量压力再引入日汇总 |
| 8 联调/移除 fixture | inactive API adapter 接到页面 | 视觉回归、真实/fixture 切换、灰度 | 必须先完成视觉冻结；本阶段禁止启用 |

本阶段已完成 1–3 的数据库/RLS/契约基础及 4–7 的安全函数骨架。每次迁移执行 `supabase db reset --local`、静态测试、RLS 集成测试；部署前补 Function 实测与安全审计。

Phase 2 已完成认证 Function、会话契约与原子手工餐食保存；下一步仅在视觉冻结后，以 feature flag 接入独立 auth/API adapter。
