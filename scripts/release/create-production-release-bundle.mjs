import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { dirname, join, resolve } from "node:path";
import { computeNormalizedArtifact } from "./production-artifact.mjs";
import { cleanupStagedArtifact, stageFunctionArtifact } from "./stage-function-artifact.mjs";

const exec = promisify(execFile);
const projectRoot = resolve(new URL("../..", import.meta.url).pathname);
const manifestPath = join(projectRoot, "cloudbaserc.json");

const triggerContracts = {
  "vision-analysis-dispatcher": {
    kind: "timer",
    schedule: "every 1 minute",
    invokes: "vision-analysis-worker via callFunction($LATEST)",
    currentReadback: "NOT_VERIFIED",
  },
  "vision-analysis-reaper": {
    kind: "timer",
    schedule: "every 1 minute",
    invokes: "get-login-ticket internal reap route",
    currentReadback: "NOT_VERIFIED",
  },
  "vision-analysis-worker": {
    kind: "internal_invocation",
    source: "vision-analysis-dispatcher",
    qualifier: "$LATEST",
    currentReadback: "NOT_VERIFIED",
  },
};

async function git(args) {
  const { stdout } = await exec("git", args, { cwd: projectRoot });
  return stdout.trim();
}

export async function createReleaseBundle() {
  const cloudbase = JSON.parse(await readFile(manifestPath, "utf8"));
  const status = await git(["status", "--short"]);
  const commit = await git(["rev-parse", "HEAD"]);
  const functions = [];
  for (const entry of cloudbase.functions) {
    const root = join(projectRoot, cloudbase.functionRoot, entry.name);
    let artifactRoot = root;
    let artifactSource = "manifest_function_directory";
    let staged = null;
    if (entry.name === "vision-analysis-worker") {
      staged = await stageFunctionArtifact({
        functionRoot: root,
        sharedRuntimeRoot: join(projectRoot, cloudbase.functionRoot, "get-login-ticket"),
      });
      artifactRoot = staged.output;
      artifactSource = "staged_function_directory_with_get_login_ticket_runtime";
    }
    const artifact = await computeNormalizedArtifact({ root: artifactRoot, ignore: entry.ignore });
    if (staged) await cleanupStagedArtifact(staged.output);
    functions.push({
      ...entry,
      root: `${cloudbase.functionRoot}/${entry.name}`,
      artifactSource,
      deploymentCommand: entry.name === "vision-analysis-worker"
        ? "stage-function-artifact.mjs vision-analysis-worker <output-root>; tcb fn deploy vision-analysis-worker --dir <output-root>"
        : `tcb fn deploy ${entry.name}`,
      localArtifact: artifact,
      productionReadback: {
        status: "NOT_VERIFIED",
        normalizedSha256: null,
        active: null,
        codeResult: null,
        updatedTime: null,
      },
      trigger: triggerContracts[entry.name] || { kind: "http_or_event", currentReadback: "NOT_VERIFIED" },
    });
  }
  return {
    schemaVersion: 1,
    status: status ? "dirty_candidate" : "clean_candidate",
    generatedAt: new Date().toISOString(),
    envId: cloudbase.envId,
    commit,
    dirtyFiles: status ? status.split("\n") : [],
    runtimePolicy: "Nodejs18.15 functions; Node 24.18.x tooling required for local release checks",
    featureFlags: { VISION_ASYNC_FOUNDATION_ENABLED: "NOT_VERIFIED" },
    migrationRegistry: "NOT_VERIFIED",
    functions,
    testEvidence: "NOT_VERIFIED",
    rollbackEvidence: "NOT_VERIFIED",
  };
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const output = process.argv[2] || "docs/release-bundles/production-release-candidate.json";
  const bundle = await createReleaseBundle();
  const destination = resolve(projectRoot, output);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, `${JSON.stringify(bundle, null, 2)}\n`);
  console.log(destination);
}
