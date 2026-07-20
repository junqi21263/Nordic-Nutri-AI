# Development Auth Environment Design

## 目标

让微信小程序的 development 构建读取根目录、已被 Git 忽略的 `.env.local`，并将必要的公开 Supabase 与 feature flag 配置注入构建产物。

## 边界

- 仅修改 `mini-program/config/index.ts`。
- 仅注入五个 `TARO_APP_*` 变量：环境名、Supabase URL、Supabase publishable key、真实认证开关、真实后端开关。
- 不读取或注入 `SUPABASE_SERVICE_ROLE_KEY`、微信 Secret、identity pepper 或其他服务端变量。
- 不修改页面、路由、UI、fixture、默认业务数据来源或自动登录行为。

## 实现

构建配置先在根目录 `.env.local` 存在时使用 Node 24 的环境文件加载能力读取它；随后以 `defineConstants` 将上述五项以编译时常量注入。缺省值继续维持现有安全默认值：`local`、空 URL/key 和两个 `false` feature flag。

## 验收

1. Node 24 下微信小程序构建成功。
2. development URL 与 publishable key 出现在构建产物中。
3. 两个 feature flag 的编译时值可由 `src/api/environment.ts` 读取。
4. 构建产物与 Git 跟踪文件中不出现 service-role、微信 Secret 或 pepper。
