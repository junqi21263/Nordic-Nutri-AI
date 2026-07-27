# Nordic Nutri AI

Nordic Nutri AI is a Taro + React WeChat Mini Program backed by a CloudBase HTTPS function and CloudBase PostgreSQL.

## Repository layout

- `mini-program/`: Taro + React + TypeScript Mini Program.
- `cloudbase/functions/get-login-ticket/`: WeChat login, product session, product APIs, AI and image-analysis adapters.
- `cloudbase/pg/migrations/`: CloudBase PostgreSQL schema migrations.
- `cloudbase/pg/seeds/`: idempotent seed data (e.g. high-frequency foods).
- `docs/`: product specs, technical designs, plans and runbooks. See `docs/FOOD_CATALOG_BACKEND.md` for the unified food data model, API and image pipeline.
- `supabase/`: legacy migration archive only; it is not installed, built or called by the application.

## Runtime flow

1. The Mini Program calls `wx.login()`.
2. The HTTPS function exchanges the one-time code with WeChat and derives the business user on the server.
3. The function returns a signed Nordic Nutri product session.
4. All account, plan, meal, insight, coach, feedback and vision traffic goes through the same authenticated HTTPS boundary.
5. Only the function uses the CloudBase PostgreSQL API key. The Mini Program never receives a database credential or AI provider key.

## Prerequisites

- Node.js 24.18.x (see `.nvmrc`)
- pnpm 10.x
- WeChat Developer Tools

## Validate and build

```bash
pnpm install
pnpm run check
pnpm --dir mini-program typecheck
pnpm --dir mini-program lint
pnpm --dir mini-program test:unit
node --test cloudbase/functions/get-login-ticket/*.test.mjs
pnpm --dir mini-program build:weapp
pnpm --dir mini-program verify:weapp
```

## WeChat Developer Tools

1. Build with `pnpm --dir mini-program build:weapp`.
2. Import the `mini-program/` directory.
3. The committed `mini-program/project.config.json` points to `dist/weapp/`.
4. Configure only local IDE preferences in `mini-program/project.private.config.json`; never commit that file.

## Secrets

Use CloudBase function environment variables for `WX_SECRET`, `CLOUDBASE_APIKEY`, session and hashing secrets, and AI provider keys. Never commit `.env` files, database credentials, access tokens, OpenID values or real user images.
