# Frontend Auth Adapter

`mini-program/src/lib/supabase-client.ts` 延迟创建唯一 Supabase Client，只使用 `TARO_APP_SUPABASE_URL` 与 publishable key。wx storage adapter 仅供 SDK 持久化 session，业务代码不记录 token。

`auth-api.ts` 提供 `loginWithWechat`、`exchangeWechatTokenHash`、`getCurrentProfile`；token hash 仅在内存中以 `verifyOtp({ token_hash, type: 'email' })` 交换，重复点击共享同一个登录 Promise。`session-manager.ts` 提供冷启动恢复、并发合并刷新、当前用户、无效会话清理和仅本地登出；`auth-store.ts` 只保存内存态，当前未被页面订阅。

默认 `TARO_APP_USE_REAL_BACKEND=false` 与 `TARO_APP_ENABLE_REAL_AUTH=false`。没有页面、路由或现有 fixture store 导入这些模块；视觉冻结后才可经显式 feature flag 接入。`backend-client.ts` 只识别 401/`UNAUTHORIZED`，且只能刷新一次后重试一次；失败必须清理会话。
