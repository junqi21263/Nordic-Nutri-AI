# Nordic Nutri AI

Nordic Nutri AI is a Taro + React WeChat Mini Program with Supabase as its backend platform.

## Repository layout

- `mini-program/`: Taro + React + TypeScript client, defaulting to WeChat Mini Program builds and retaining H5 build support.
- `supabase/`: migrations, Edge Functions, seeds, and Supabase tests.
- `docs/`: PRD, technical design, and execution plans.
- `scripts/`: repeatable local validation commands.

## Current scope

The repository currently contains the engineering foundation and fixture-only page shells. It does not include real product workflows, WeChat login implementation, database reads/writes, AI provider logic, or a deployed frontend.

## Prerequisites

- Node.js 24.18.0 (see `.nvmrc`)
- pnpm 10.x
- Docker Desktop for future local Supabase work

## Verify the repository foundation

```bash
pnpm install
pnpm run check
pnpm --filter @nordic-nutri-ai/mini-program run typecheck
pnpm --filter @nordic-nutri-ai/mini-program run lint
pnpm --filter @nordic-nutri-ai/mini-program run build:weapp
```

## WeChat Developer Tools

1. Build the WeChat target with `pnpm --filter @nordic-nutri-ai/mini-program run build:weapp`.
2. In WeChat Developer Tools, import the `mini-program/` directory.
3. The committed `project.config.json` points the tool to `mini-program/dist/weapp/`.
4. Create `mini-program/project.private.config.json` from its example only for local IDE preferences; never commit it.

Do not commit `.env` files, Supabase secret/service keys, WeChat AppSecret,
database passwords, or AI provider keys.
