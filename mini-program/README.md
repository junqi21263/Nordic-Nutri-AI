# Nordic Nutri AI Mini Program

This package is a Taro 4.2 + React 18 + TypeScript client. Its default target is WeChat Mini Program; H5 is maintained as a build target only, not as a product commitment.

## Commands

```bash
pnpm --filter @nordic-nutri-ai/mini-program run dev:weapp
pnpm --filter @nordic-nutri-ai/mini-program run build:weapp
pnpm --filter @nordic-nutri-ai/mini-program run build:h5
pnpm --filter @nordic-nutri-ai/mini-program run typecheck
pnpm --filter @nordic-nutri-ai/mini-program run lint
pnpm --filter @nordic-nutri-ai/mini-program run test:unit
```

## Directory responsibilities

- `config/`: Taro build configuration for shared, development and production modes.
- `src/pages/`: route-level layout shells; no API calls or business writes.
- `src/components/`: reusable Nordic visual components with typed props.
- `src/layouts/`: shared app/page shell, safe-area, scroll content and custom bottom navigation composition.
- `src/styles/`: design tokens and global styles; components should consume these tokens rather than introduce ad-hoc colours or radii.
- `src/stores/`: local Zustand state boundaries with initial state, setters and reset only.
- `src/api/`: QueryClient, error mapping, public configuration and request interfaces.
- `src/services/`: platform-adapted session storage and future Auth boundaries.
- `src/hooks/`: future reusable React hooks.
- `src/types/`: UI, runtime and product-neutral TypeScript types.
- `src/utils/`: fixture and pure utility data only.
- `src/assets/`: static assets, currently empty.

## UI Foundation

The UI Foundation is intentionally presentation-only. It uses `src/styles/tokens.scss` for all colour, typography, radius, shadow, spacing and motion values; `src/styles/layout.scss` for the page shell; and typed components under `src/components/` for the Nordic wellness interface. Route pages use realistic local fixture content only and make no Auth, Supabase, storage, upload or AI request.

Run the static foundation guard with:

```bash
node scripts/verify-ui-foundation.mjs
```

## Public configuration

Only these build-time variables are readable by client code:

```text
TARO_APP_ENV=local
TARO_APP_SUPABASE_URL=
TARO_APP_SUPABASE_PUBLISHABLE_KEY=
```

They must be provided through ignored local environment files or CI variables. Do not put a Supabase secret/service key, WeChat AppSecret, AI key or database password in this package.

## WeChat Developer Tools

Run `build:weapp`, then import this `mini-program/` directory. Taro emits the importable output into `dist/weapp/`; H5 output is isolated in `dist/h5/`. Both are ignored by Git.
