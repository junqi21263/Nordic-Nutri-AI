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
  "cloudbase/functions/get-login-ticket",
  "cloudbase/pg/migrations",
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
  assert.equal(packageJson.devDependencies.supabase, undefined);
  assert.ok(packageJson.devDependencies.typescript);
  assert.ok(gitignore.includes(".env*"));
});

test("CloudBase runtime contract contains no client-side backend secrets", () => {
  const envExample = readFileSync(path.join(root, ".env.example"), "utf8");
  const packageJson = readFileSync(path.join(root, "package.json"), "utf8");

  assert.ok(envExample.includes("CLOUDBASE_APIKEY="));
  assert.ok(envExample.includes("APP_SESSION_SECRET="));
  assert.ok(envExample.includes("DEEPSEEK_API_KEY="));
  assert.ok(envExample.includes("VITA_API_KEY="));
  assert.doesNotMatch(envExample, /SUPABASE_/);
  assert.doesNotMatch(packageJson, /\"supabase\"\s*:/);
});
