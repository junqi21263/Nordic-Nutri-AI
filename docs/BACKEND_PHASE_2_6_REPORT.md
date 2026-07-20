# Backend Phase 2.6 Report

## 范围与目标

本次仅部署并验收 development Supabase 项目 `bghrpsrpekbbyuoyhncl`（`nordic-nutri-dev`）。未执行 production 操作、远程 `db reset`、远程数据删除或 AI 实现；现有业务页面、路由、UI 与 fixture 均未改动。

## 远程部署

远程 migration history 在部署前为空，本地以下四个 migration 已按顺序安全写入目标项目，并已用 `supabase migration list --linked` 核对本地与远程版本一致：

1. `0001` — `initial_schema`
2. `20260716015243` — `backend_phase1_foundation`
3. `20260716021243` — `backend_phase2_auth_and_meal_closure`
4. `20260716022627` — `backend_phase25_auth_hardening`

CLI 的 `db push --dry-run` 在本机等待交互式数据库密码，因此在未写入任何 migration 前停止。为避免索取或暴露数据库密码，改用已登录账号的 Supabase Management API 逐条事务执行 migration；每条成功后才继续下一条。后续 migration 仍应先核对 history，且禁止以此流程替代生产变更评审。

已部署的 Edge Functions：

| Function | 远程状态 | 版本 | JWT 网关配置 |
| --- | --- | ---: | --- |
| `health` | `ACTIVE` | 1 | `verify_jwt = false` |
| `wechat-login` | `ACTIVE` | 1 | `verify_jwt = false` |
| `save-meal` | `ACTIVE` | 1 | `verify_jwt = false`，函数内强制用户 JWT |

`wechat-login` 必须允许未登录请求以完成微信身份到 Supabase Session 的交换。`save-meal` 关闭网关预检是为了返回统一错误包络，但函数内 `requireUser` 仍拒绝无效或缺失 Bearer token。

## 数据库与权限验收

- `profiles`、`user_settings`、`body_profiles`、`user_goals`、`meal_records`、`meal_items`、`wechat_identities`、`wechat_login_codes`、`uploaded_assets` 均启用 RLS。
- `active_meal_records` 和 `save_meal_atomic` 均为 `security_invoker`，不会绕过调用者的 RLS 上下文。
- 已核对核心表的 trigger、index 与外键均已创建。
- `food-images` bucket 为私有 bucket；对象的读、写、删 policy 均限定 bucket 名且首层路径必须等于 `auth.uid()`。
- `wechat_identities` 与 `wechat_login_codes` 未授予 anon/authenticated 角色访问权限；二者均仅供受控 Edge Function 的 service-role 路径使用。

## Secrets 与函数安全冒烟

远程仅核对了 Secret 名称，不读取或输出值：

- `WECHAT_APP_ID`
- `WECHAT_APP_SECRET`
- `WECHAT_IDENTITY_PEPPER`
- `WECHAT_MOCK_ENABLED`

托管 Edge Function 的 Supabase 内置环境变量由平台提供，未把 `SUPABASE_SERVICE_ROLE_KEY` 重复写入仓库或 `.env.remote.local`。通过远程 Function 调用验证 `WECHAT_MOCK_ENABLED=false` 的真实 code2Session 错误路径生效。

| 检查 | 结果 |
| --- | --- |
| `health` | HTTP 200，统一成功包络和 `requestId` 正常 |
| `wechat-login` 缺少 `code` | HTTP 400，`VALIDATION_ERROR`，含 `requestId` |
| `wechat-login` 无效 code | HTTP 401，受控微信错误映射，含 `requestId` |
| `save-meal` 无登录态 | HTTP 401，`UNAUTHORIZED`，含 `requestId` |
| 近 30 分钟 Edge Function 日志 | 未发现 `openid`、`unionid`、`session_key`、`token_hash` 或 JWT 字面量 |

这些调用没有返回数据库原始异常或 Secret。无效微信 code 只验证了服务器真实微信路径与错误映射，不能等价为真实登录成功。

## 客户端类型与配置

`mini-program/src/api/database.types.ts` 已由该 development 项目的远程 public schema 重新生成，覆盖 Phase 2 所需的 `wechat_identities`、`wechat_login_codes`、`active_meal_records` 和 `save_meal_atomic` 等类型。

development 构建需要以下公开变量（publishable key 不是 service role key）：

```dotenv
TARO_APP_ENV=development
TARO_APP_SUPABASE_URL=https://bghrpsrpekbbyuoyhncl.supabase.co
TARO_APP_SUPABASE_PUBLISHABLE_KEY=<development publishable key>
TARO_APP_ENABLE_REAL_AUTH=true
TARO_APP_USE_REAL_BACKEND=false
```

production 必须保持 `TARO_APP_ENABLE_REAL_AUTH=false`，并且构建产物不得包含 dev-only harness。`TARO_APP_USE_REAL_BACKEND` 在本阶段继续为 `false`；没有正式业务页面会自动发起登录或切换到真实数据。

## 真实微信登录与真实 Session：待微信运行时验收

当前执行环境没有接入微信开发者工具或真机 runtime，无法取得一个真实、一次性的 `wx.login` code。因此以下项目**尚未验证，不能宣称通过**：首次和重复真实微信登录、Supabase `verifyOtp` Session 交换、Session 恢复/刷新、`auth.getUser`、Profile/settings 自动投影、真实 JWT RLS 隔离，以及 authenticated `save-meal` 的幂等/回滚/跨用户测试。

在微信公众平台为相同 development AppID 配置服务器域名，并为测试账号开通开发权限后，在微信开发者工具执行：

1. 在“开发管理 / 开发设置 / 服务器域名”将 `https://bghrpsrpekbbyuoyhncl.supabase.co` 配置为 request 合法域名；若使用图片上传/下载，同步配置为 upload/download 合法域名。未使用 Realtime 时无需 WebSocket 域名。
2. 用上述 development 变量构建小程序，且仅在 dev-only Auth Harness 中手动触发 `loginWithWechat()`；不得接入正式页面。
3. 记录脱敏的 `requestId`，依次验证 `wx.login → wechat-login → verifyOtp({ token_hash, type: 'email' }) → auth.getUser → Profile`。
4. 再执行一次登录，确认相同微信用户映射到同一 Auth user、Profile 与 settings 不重复创建、`last_login_at` 更新，且 code 与 token hash 都不能重放。
5. 用获得的用户 JWT（绝不用 service role）执行本人/跨用户 RLS 与 `save-meal` 的两个 item、幂等、失败回滚、归档恢复测试。

微信 `code2Session` 是 Edge Function 到微信服务端的调用；小程序不需要、也不应配置 `api.weixin.qq.com` 为请求域名。

## 当前联调结论

development 后端、schema、RLS、Storage policy、Function 部署和匿名错误包络已经具备单链路联调的前置条件。真实前端认证联调仍被微信 runtime 登录验收阻塞；在该验收通过且前端视觉冻结前，不应启用任何正式页面的 `USE_REAL_BACKEND`。
