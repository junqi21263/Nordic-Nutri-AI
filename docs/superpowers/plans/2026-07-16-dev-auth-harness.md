# Development Auth Harness

已完成的 development-only 认证验收基础设施，范围仅限调试页面和认证客户端适配；不接入正式业务页面、不替换 fixture。

## 构建与环境

- Taro 配置读取 Git 忽略的根目录 `.env.local`，并在构建期注入公开变量。
- `TARO_APP_ENV=development` 时注册 `pages/dev-auth-harness/index`；该页不在 tabBar 中。
- `TARO_APP_ENV=production` 时不生成该页。

## 安全边界

- 页面仅显示脱敏配置状态、阶段状态、HTTP 状态、错误码、脱敏错误类型/消息、`requestId` 与截断用户 ID。
- 不渲染或记录微信 code、一次性认证材料、会话令牌、微信身份字段或服务端密钥。
- 开发日志只记录 Function 调用开始、完成或失败，以及截断项目引用、HTTP 状态和 `requestId`。

## 微信网络适配

`src/lib/wechat-fetch.ts` 将 `wx.request` 统一适配为 Supabase JS 所需的 `fetch` 接口，并由 `createClient` 的 `global.fetch` 注入。它支持 GET、POST、PATCH、DELETE、headers、JSON 文本响应、HTTP status、超时和 AbortController 取消；不输出请求 body 或 headers。

## 验证命令

```bash
PATH=/opt/homebrew/Cellar/node@24/24.18.0/bin:$PATH pnpm run typecheck:mini-program
PATH=/opt/homebrew/Cellar/node@24/24.18.0/bin:$PATH pnpm --dir mini-program test:unit
PATH=/opt/homebrew/Cellar/node@24/24.18.0/bin:$PATH pnpm --dir mini-program lint
PATH=/opt/homebrew/Cellar/node@24/24.18.0/bin:$PATH pnpm --dir mini-program build:weapp
```
