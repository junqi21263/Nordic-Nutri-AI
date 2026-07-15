#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_root"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker Desktop is required but docker is not installed." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not running. Start Docker Desktop and run this script again." >&2
  exit 1
fi

pnpm exec supabase status >/dev/null

curl --fail --silent --show-error --max-time 5 http://127.0.0.1:54321/rest/v1/ >/dev/null
curl --fail --silent --show-error --max-time 5 http://127.0.0.1:54323/ >/dev/null

echo "Supabase local API and Studio are healthy."
