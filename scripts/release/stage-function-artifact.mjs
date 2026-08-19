import { cp, mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";

const DEFAULT_IGNORE = ["*.test.mjs", "node_modules", ".git", "*.log"];

function shouldIgnore(name) {
  return DEFAULT_IGNORE.includes(name) || name.endsWith(".test.mjs");
}

async function copyTree(source, destination) {
  await mkdir(destination, { recursive: true });
  const entries = await (await import("node:fs/promises")).readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    if (shouldIgnore(entry.name)) continue;
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) await copyTree(from, to);
    else if (entry.isFile()) await cp(from, to);
  }
}

export async function stageFunctionArtifact({ functionRoot, sharedRuntimeRoot = null, outputRoot = null } = {}) {
  if (!functionRoot) throw new Error("FUNCTION_ROOT_REQUIRED");
  const source = resolve(functionRoot);
  const output = outputRoot ? resolve(outputRoot) : await mkdtemp(join(tmpdir(), "nordic-function-"));
  await copyTree(source, output);

  if (sharedRuntimeRoot) {
    const sharedSource = resolve(sharedRuntimeRoot);
    const sharedDestination = join(output, "get-login-ticket");
    await copyTree(sharedSource, sharedDestination);
    const sharedPackage = JSON.parse(await readFile(join(sharedSource, "package.json"), "utf8"));
    await cp(join(sharedSource, "package.json"), join(output, "package.json"));
    return { output, sharedRuntime: "get-login-ticket", dependencies: Object.keys(sharedPackage.dependencies || {}).sort() };
  }
  return { output, sharedRuntime: null, dependencies: [] };
}

export async function cleanupStagedArtifact(output) {
  if (output) await rm(output, { recursive: true, force: true });
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const functionName = process.argv[2];
  const outputRoot = process.argv[3];
  if (!functionName || !outputRoot) throw new Error("USAGE: stage-function-artifact.mjs <function-name> <output-root>");
  const projectRoot = resolve(new URL("../..", import.meta.url).pathname);
  const functionRoot = join(projectRoot, "cloudbase/functions", functionName);
  const result = await stageFunctionArtifact({
    functionRoot,
    sharedRuntimeRoot: functionName === "vision-analysis-worker"
      ? join(projectRoot, "cloudbase/functions/get-login-ticket")
      : null,
    outputRoot,
  });
  console.log(JSON.stringify(result));
}
