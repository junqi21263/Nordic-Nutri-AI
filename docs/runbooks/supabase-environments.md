# Supabase Environments

## Local

Use `pnpm exec supabase start` to run the local Docker stack. Keep generated
local credentials in `.env.local`; the file is ignored by Git. Validate the
stack with `./scripts/check-supabase.sh`.

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
