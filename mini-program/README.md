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
- `src/pages/`: product pages that call authenticated CloudBase HTTPS APIs.
- `src/components/`: reusable Nordic visual components with typed props.
- `src/layouts/`: shared app/page shell, safe-area, scroll content and custom bottom navigation composition.
- `src/styles/`: design tokens and global styles; components should consume these tokens rather than introduce ad-hoc colours or radii.
- `src/stores/`: Zustand state for local UI and hydrated product data.
- `src/api/`: QueryClient, error mapping, public configuration and request interfaces.
- `src/services/`: platform-adapted session storage and auth helpers.
- `src/hooks/`: reusable React hooks.
- `src/types/`: UI, runtime and product-neutral TypeScript types.
- `src/utils/`: pure utility helpers.
- `src/assets/`: static images and icons.

## Public configuration

Only these non-secret build settings are readable by client code:

```text
TARO_APP_ENV=local
```

Milestone illustrations use the repository-root environment files rather than
`mini-program/.env.local`. Taro is configured explicitly in `config/index.ts`:

- development: shell variables → `.env.local` → `.env.development` → `.env`
- production: shell variables → `.env.local` → `.env.production` → `.env`

Because Node preserves an existing value, the earlier source has priority.
The release script supplies `NODE_ENV=production TARO_APP_ENV=production`, so
it always selects `.env.production` when no local override exists.

Set the HTTPS CDN **Root** (without `/milestones`) in the relevant root env
file:

```text
TARO_APP_MILESTONE_ASSET_CDN=https://lewis-healthy-d4glgqqzv73a5bc10-1420560890.tcloudbaseapp.com
```

The app generates `${TARO_APP_MILESTONE_ASSET_CDN}/milestones/${filename}`.
Development retains a packaged fallback for offline work. Production fails at
build time when this value is absent and never packages the formal milestone
illustrations; CDN failures keep the fixed illustration frame as a stable
placeholder and make Canvas export report the CDN error instead of silently
substituting a stale local image. The host must be added to WeChat's
`downloadFile` legal domain before release.

Build commands:

```bash
pnpm --filter @nordic-nutri-ai/mini-program run build:weapp:dev
pnpm --filter @nordic-nutri-ai/mini-program run build:weapp
```

Do not put a CloudBase API Key, WeChat AppSecret, AI key or database password in this package. Server-side credentials belong only in CloudBase function configuration.

## Secrets

Never commit `.env.local`, API keys, OpenID values, or real user images.
