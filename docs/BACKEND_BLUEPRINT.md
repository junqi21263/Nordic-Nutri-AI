# Backend Blueprint

本阶段以现有小程序页面、Zustand fixture 与 Supabase 初始迁移为依据。页面仍只读取本地 store；新增契约文件不被页面默认调用。

## 模块与边界

| 模块 | 职责 | 调用方式 |
| --- | --- | --- |
| Auth/身份 | 微信 code 换取 Supabase 会话、用户投影 | `wechat-login` Edge Function；local mock 闭环已验证，开发环境待部署 |
| 资料与偏好 | profiles、user_settings、body_profiles、user_goals | 客户端 Supabase Data API + RLS |
| 餐食 | meal_records、meal_items、uploaded_assets；按日期/餐次/关键词分页 | 客户端 Data API + RLS；原子多项保存预留 `save-meal` |
| 计划 | nutrition_plans（领域名“健康计划”）及 health_plan_items | 读取走 RLS，生成/激活走 Edge Function |
| AI/教练 | 图片分析、计划生成、会话回复 | Edge Function，密钥仅服务端 |
| 首页 | 当日餐食、宏量汇总、当前计划、最近身体资料 | Phase 1 实时聚合；不持久化 daily summary |

客户端只携带 publishable key 和用户 JWT。所有 CRUD 由 `auth.uid()` 与 RLS 归属；客户端提交的 `user_id` 仅作为待 RLS 校验值，绝不作为授权依据。service role、微信 App Secret、AI key 只能进入 Supabase Function Secrets。

## 身份、图片与调用流

`小程序 → wechat-login → 微信 code2Session → Auth/Admin → JWT → Data API/RLS`。local/test 可使用显式 mock code；development/production 必须配置微信服务端密钥并调用真实 code2Session。

Phase 2.5 已将该链路验证为官方 OTP bridge：Function 通过 `generateLink` 返回一次性 token hash，小程序用 `verifyOtp({ token_hash, type: 'email' })` 换取 Supabase 标准 session；绝不由 Function 自制 JWT。请求层只对 401 合并一次 refresh/retry；失败清理本地 session。

图片先直传私有 `food-images`（`{uid}/{yyyy}/{mm}/{uuid}.jpg|webp`），再写 uploaded_assets，最后调用 `analyze-food`。分析草稿使用已有 ai_analysis；用户可在确认保存前编辑候选食材，最终 meal_items 保存用户确认数量与营养快照。`save_meal_atomic` 会拒绝非本人 plan、asset 路径或 analysis 引用。原图不进入日志，临时未保存分析可在 24 小时后清理。

## 运行规范

Function 统一响应 `{success,data,meta,requestId}` 或 `{success:false,error,requestId}`。错误不透传 Postgres/第三方原文；requestId 来自请求头或随机 UUID，日志只记录 requestId、事件、HTTP 状态和错误码。`client_request_id` 用于 AI 分析、计划和餐食的去重；重复餐食写入返回冲突。

用户资料、饮食偏好属于敏感健康数据：私有 bucket、最小授权、无匿名表权限、不以 JWT user_metadata 授权。目标与 Body Profile 用插入新版本的方式更新，并由受控触发器退役旧 current 版本；体重暂不单独建时间序列，现有 Body Profile 版本已承载页面所需历史。
