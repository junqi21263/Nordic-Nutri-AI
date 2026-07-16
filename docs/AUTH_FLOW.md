# Auth Flow

微信小程序调用 `wx.login()` 获得一次性 code，发送到 `wechat-login`。Function 在生产环境以 `WECHAT_APP_ID`/`WECHAT_APP_SECRET` 调用 code2Session；local/test 仅在 `APP_ENV=local|test` 且 `WECHAT_MOCK_ENABLED=true` 时使用 `WECHAT_MOCK_CODES` 的固定映射。

Function 只在内存中使用 openid、unionid、session_key；持久化仅保存 openid 的 SHA-256 哈希。它以 service role 查询或创建映射用户，并调用 Supabase Admin `generateLink({type:'magiclink'})`。返回的 `tokenHash` 是一次性 OTP 凭据，小程序使用 publishable-key Supabase client 的 `verifyOtp({token_hash: tokenHash,type:'magiclink'})` 取得官方 access/refresh session；不自行签发 JWT。

会话存储在小程序受控 storage；启动时 `getSession`，临近/已经失效时 `refreshSession`，401 时只刷新一次后重试一次，失败则清空 storage 并重新微信登录。退出调用 `signOut` 后清理本地会话。多设备允许并存，风险操作以后可按 Supabase session 管理收紧。

code 哈希在 `wechat_login_codes` 中唯一，阻断重复提交；同一 openid 由唯一 hash 映射到同一 Auth user。日志只记录 requestId、状态和错误码，绝不记录 code、openid、unionid、session_key、tokenHash 或 access token。
