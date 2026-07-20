# Supabase Environments

## Local

Use `pnpm exec supabase start` to run the local Docker stack. Keep generated
local credentials in `.env.local`; the file is ignored by Git. Validate the
stack with `./scripts/check-supabase.sh`.

### Phase 1 commands

```bash
pnpm exec supabase start
pnpm exec supabase db reset --local
pnpm run test:auth:static
pnpm run test:auth:local
pnpm exec supabase functions serve health --no-verify-jwt
curl -H "apikey: <local-publishable-key>" http://127.0.0.1:54321/functions/v1/health
```

For protected Functions, set `SUPABASE_URL` and the local publishable key in
the Function environment. In hosted environments set `SUPABASE_SERVICE_ROLE_KEY`,
`WECHAT_APP_ID`, `WECHAT_APP_SECRET`, and provider AI keys through Function
Secrets only; never add them to `TARO_APP_*` variables.

## Development

Use the separate `nordic-nutri-dev` Supabase project for integration testing
and WeChat developer previews. Its project ref, URL, and publishable key belong
only in an ignored local environment file or the CI secret store.

Before linking a CLI session, authenticate locally with `pnpm exec supabase
login`, then run `pnpm exec supabase link --project-ref <development-project-ref>`.
Do not paste a Supabase access token or database password into the repository.

## Production

Create and maintain a separate production Supabase project. Production must not
share its database, Storage bucket, Auth users, AI provider key, or WeChat
AppSecret with development. Only reviewed `main` releases may target it.
