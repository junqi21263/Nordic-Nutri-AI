import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { cleanupStagedArtifact, stageFunctionArtifact } from "./stage-function-artifact.mjs";

const repo = new URL("../../", import.meta.url).pathname;

test("stages worker with its shared runtime and excludes tests/node_modules", async () => {
  const output = await mkdtemp(join(tmpdir(), "nordic-stage-test-"));
  try {
    const result = await stageFunctionArtifact({
      functionRoot: join(repo, "cloudbase/functions/vision-analysis-worker"),
      sharedRuntimeRoot: join(repo, "cloudbase/functions/get-login-ticket"),
      outputRoot: join(output, "worker"),
    });
    assert.equal(result.sharedRuntime, "get-login-ticket");
    await stat(join(output, "worker/index.js"));
    await stat(join(output, "worker/get-login-ticket/index.js"));
    await stat(join(output, "worker/package.json"));
    assert.equal(await stat(join(output, "worker/node_modules")).then(() => true).catch(() => false), false);
    assert.equal(await stat(join(output, "worker/get-login-ticket/index.test.mjs")).then(() => true).catch(() => false), false);
    const pkg = JSON.parse(await readFile(join(output, "worker/package.json"), "utf8"));
    assert.ok(pkg.dependencies["@cloudbase/js-sdk"]);
    assert.ok(pkg.dependencies["@cloudbase/ai"]);
  } finally {
    await rm(output, { recursive: true, force: true });
  }
});

test("cleanup is idempotent", async () => {
  const output = await mkdtemp(join(tmpdir(), "nordic-stage-cleanup-"));
  await cleanupStagedArtifact(output);
  await cleanupStagedArtifact(output);
});
