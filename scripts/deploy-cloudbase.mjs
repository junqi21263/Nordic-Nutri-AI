import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertBranchMatchesTarget,
  getDeploymentConfig,
  isBranchAllowedForTarget,
  resolveDeploymentTarget,
} from "./cloudbase-deploy-config.mjs";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const [targetName, functionName, ...flags] = process.argv.slice(2);
const dryRun = flags.includes("--dry-run");
const target = resolveDeploymentTarget(targetName);

if (!functionName || flags.some((flag) => flag !== "--dry-run")) {
  throw new Error("Usage: pnpm deploy:cloudbase <test|production> <function-name|--all> [--dry-run]");
}

const branch = execFileSync("git", ["branch", "--show-current"], { cwd: projectRoot, encoding: "utf8" }).trim();
const branchAllowed = isBranchAllowedForTarget(branch, target);
if (!dryRun) assertBranchMatchesTarget(branch, target);

const manifestPath = join(projectRoot, "cloudbaserc.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const config = getDeploymentConfig(manifest, target);
const tempDir = await mkdtemp(join(tmpdir(), "nordic-cloudbase-"));
const targetManifest = join(tempDir, "cloudbaserc.json");

try {
  await writeFile(targetManifest, `${JSON.stringify(config, null, 2)}\n`);
  const args = ["--config-file", targetManifest, "--env-id", target.envId, "fn", "deploy"];
  if (functionName === "--all") args.push("--all");
  else args.push(functionName);

  if (dryRun) {
    console.log(JSON.stringify({
      target: target.name,
      envId: target.envId,
      branch,
      branchAllowed,
      command: ["tcb", "--config-file", "<temporary-manifest>", "--env-id", target.envId, "fn", "deploy", ...args.slice(6)],
    }, null, 2));
  } else {
    execFileSync("tcb", args, { cwd: projectRoot, stdio: "inherit" });
  }
} finally {
  await rm(tempDir, { recursive: true, force: true });
}
