# Backend Phase 2.5 Report

## 已验收

- Node `v24.18.0`、npm `11.16.0`、pnpm `10.33.0`；`.nvmrc` 与 engines 均固定 Node 24。
- `@supabase/supabase-js` / `@supabase/auth-js` 均为 `2.110.6`；token hash 交换固定为 `verifyOtp({ token_hash, type: 'email' })`。
- 微信 identity 与 code 重放摘要使用具有用途前缀的 HMAC-SHA256；pepper 仅作为 Function Secret，不进入日志或客户端构建。
- 在 local Function runtime 中以 `APP_ENV=production` + mock 配置实际验证：Function 不接受 mock code，而因缺少真实微信 Secret 受控失败；恢复 local/test 配置后 mock 无效 code 返回 401。
- local mock E2E 已覆盖首次/重复登录、code 与 token hash 重放、两个身份隔离、session 获取/刷新、真实 JWT 的 Profile/active meal RLS、authenticated save-meal、幂等、归档恢复、跨用户 asset 拒绝与失败整单回滚。
- 小程序新增延迟单例 Supabase client、wx storage adapter、Session Manager、Auth Store、Auth API、401 单次刷新请求层和默认关闭的 feature flags；没有页面接入它们。
- 构建产物中未发现 service role、微信 App Secret、pepper、AI key、mock code、token hash、unionid 或 session_key；`taro.js` 中唯一的 `openid` 是微信 VoIP 组件的框架属性，不是项目数据。

## 未验收

development Supabase 项目尚未提供 project ref 或 Function Secrets，因此没有远程部署，也没有真实微信 code2Session 调用。本仓库未保存任何真实值。
