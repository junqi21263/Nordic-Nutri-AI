import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requiredPaths = [
  ".env.example",
  ".gitignore",
  ".nvmrc",
  "CONTRIBUTING.md",
  "README.md",
  "package.json",
  "pnpm-workspace.yaml",
  "mini-program/src/pages",
  "mini-program/src/components",
  "mini-program/src/services",
  "mini-program/src/stores",
  "mini-program/src/utils",
  "mini-program/src/api",
  "mini-program/src/types",
  "mini-program/src/assets",
  "mini-program/src/config",
  "supabase/migrations",
  "supabase/functions",
  "supabase/seed",
  "supabase/tests",
];

test("monorepo initialization provides required root files and directories", () => {
  for (const relativePath of requiredPaths) {
    assert.ok(existsSync(path.join(root, relativePath)), `${relativePath} must exist`);
  }
});

test("workspace configuration pins the approved tooling without secrets", () => {
  const packageJson = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
  const gitignore = readFileSync(path.join(root, ".gitignore"), "utf8");

  assert.equal(packageJson.packageManager.startsWith("pnpm@10."), true);
  assert.equal(packageJson.engines.node, ">=24.18.0 <25");
  assert.ok(packageJson.devDependencies.supabase);
  assert.ok(packageJson.devDependencies.typescript);
  assert.ok(gitignore.includes(".env*"));
  assert.ok(gitignore.includes(".supabase/"));
});

test("supabase baseline has local config, environment contract, and health check", () => {
  const config = readFileSync(path.join(root, "supabase/config.toml"), "utf8");
  const envExample = readFileSync(path.join(root, ".env.example"), "utf8");

  assert.ok(config.includes('project_id = "nordic-nutri-ai"'));
  assert.ok(config.includes("[functions.wechat-login]"));
  assert.ok(envExample.includes("SUPABASE_PROJECT_REF="));
  assert.ok(existsSync(path.join(root, "scripts/check-supabase.sh")));
  assert.ok(existsSync(path.join(root, "docs/runbooks/supabase-environments.md")));
});
