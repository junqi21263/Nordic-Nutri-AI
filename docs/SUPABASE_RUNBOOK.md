# Supabase Runbook

```bash
pnpm exec supabase start
pnpm exec supabase db reset --local
pnpm run test:auth:static
pnpm run test:auth:local
pnpm exec supabase functions serve wechat-login --env-file supabase/.env.local
```

Function Secrets：`SUPABASE_SERVICE_ROLE_KEY`、`WECHAT_APP_ID`、`WECHAT_APP_SECRET`、AI provider keys。它们不得以 `TARO_APP_*`、Git 文件或日志出现。生产环境必须 `WECHAT_MOCK_ENABLED=false`；缺少微信密钥时登录 Function 返回受控错误。
