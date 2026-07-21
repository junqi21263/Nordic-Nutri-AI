# Contributing

## Branches

- `main`: production-ready history.
- `develop`: development integration branch.
- `codex/<scope>-<name>`: one focused Codex-assisted product capability.
- `chore/<name>`: tooling, documentation, dependency, or CI work.
- `fix/<name>`: verified defect fix.

## Commits

Use Conventional Commits: `type(scope): summary`.

Examples:

- `chore(repo): initialize monorepo workspace`
- `docs(architecture): document cloudbase deployment`
- `security(db): add owner rls policies`

Keep migrations separate from unrelated UI or dependency changes. Do not amend a
migration that has been applied to a shared environment; create a new migration.

## Security

Never commit environment files, CloudBase API keys, database passwords, WeChat
AppSecret, AI provider keys, access tokens, OpenID values, or real user images.
Use CloudBase function environment variables for server-only values.
