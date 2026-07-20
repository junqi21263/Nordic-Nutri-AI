# Supabase Runbook

```bash
pnpm exec supabase start
pnpm exec supabase db reset --local
pnpm run test:auth:static
pnpm run test:auth:local
pnpm run test:auth:mock-e2e
pnpm exec supabase functions serve wechat-login --env-file supabase/.env.local
```

`supabase/.env.local` 是已忽略的 local/test Function 环境文件；mock 仅在 `APP_ENV=local|test` 和 `WECHAT_MOCK_ENABLED=true` 时可用。Function Secrets：`SUPABASE_SERVICE_ROLE_KEY`、`WECHAT_APP_ID`、`WECHAT_APP_SECRET`、`WECHAT_IDENTITY_PEPPER`、AI provider keys。它们不得以 `TARO_APP_*`、Git 文件或日志出现。生产环境必须 `WECHAT_MOCK_ENABLED=false` 且不得设置 `WECHAT_MOCK_CODES`；缺少微信密钥时登录 Function 返回受控错误。

```bash
pnpm exec supabase secrets set --project-ref <dev-ref> WECHAT_IDENTITY_PEPPER=<value>
pnpm exec supabase secrets set --project-ref <dev-ref> WECHAT_APP_ID=<value> WECHAT_APP_SECRET=<value>
pnpm exec supabase functions deploy wechat-login --project-ref <dev-ref>
pnpm exec supabase functions deploy save-meal --project-ref <dev-ref>
pnpm exec supabase functions deploy health --project-ref <dev-ref>
pnpm exec supabase secrets list --project-ref <dev-ref>
```
