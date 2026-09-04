# Nordic Nutri AI

Nordic Nutri AI is a Taro + React WeChat Mini Program backed by a CloudBase HTTPS function and CloudBase PostgreSQL.

## Repository layout

- `mini-program/`: Taro + React + TypeScript Mini Program.
- `cloudbase/functions/get-login-ticket/`: WeChat login, product session, product APIs, AI and image-analysis adapters.
- `cloudbase/pg/migrations/`: CloudBase PostgreSQL schema migrations.
- `cloudbase/pg/seeds/`: idempotent seed data (e.g. high-frequency foods).
- `docs/`: current runbooks plus recent CloudBase plans/specs. See `docs/FOOD_CATALOG_BACKEND.md` for the unified food data model, API and image pipeline.

## Runtime flow

1. The Mini Program calls `wx.login()`.
2. The HTTPS function exchanges the one-time code with WeChat and derives the business user on the server.
3. The function returns a signed Nordic Nutri product session.
4. All account, plan, meal, insight, coach, feedback and vision traffic goes through the same authenticated HTTPS boundary.
5. Only the function uses the CloudBase PostgreSQL API key. The Mini Program never receives a database credential or AI provider key.

Android Auth V1 uses the same HTTPS Function with `/auth/*` routes. It supports Google Credential Manager, email/password and phone/password. Email/SMS codes are used only for registration and password recovery. Android accounts use `public.app_users.id`, are marked with `created_platform=android_app`, and use a seven-day signed Bearer token invalidated by `token_version` changes. The existing WeChat login path remains separate.

The Android shell must provide two small native bridges before device acceptance: `NordicGoogleCredentialManager.getIdToken()` for Google Credential Manager and `NordicSecureStorage.get/set/remove` for token persistence. The web/Taro layer does not contain Google or storage secrets and does not fall back to plain browser storage for Android tokens.

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

Use CloudBase function environment variables for `WX_SECRET`, `CLOUDBASE_APIKEY`, session/auth hashing secrets, Brevo email configuration and AI provider keys. Never commit `.env` files, database credentials, access tokens, OpenID values, OTP/CAPTCHA answers or real user images. Do not enable `ANDROID_AUTH_ENABLED` in production until the Email Auth migration, provider delivery and Android-device gates are explicitly accepted.
