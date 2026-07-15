# Contributing

## Branches

- `main`: production-ready history.
- `develop`: development integration branch.
- `feature/<scope>-<name>`: one focused product capability.
- `chore/<name>`: tooling, documentation, dependency, or CI work.
- `fix/<name>`: verified defect fix.

## Commits

Use Conventional Commits: `type(scope): summary`.

Examples:

- `chore(repo): initialize monorepo workspace`
- `docs(architecture): add supabase setup runbook`
- `security(db): add owner rls policies`

Keep migrations separate from unrelated UI or dependency changes. Do not amend a
migration that has been applied to a shared environment; create a new migration.

## Security

Never commit environment files, Supabase secret/service keys, database
passwords, WeChat AppSecret, AI provider keys, access tokens, OpenID values, or
real user images. Use Supabase project secrets for server-only values.
