import assert from "node:assert/strict";
import test from "node:test";
import { createReleaseBundle } from "./create-production-release-bundle.mjs";

test("release bundle includes vision functions, trigger contracts, SHA, and unverified production fields", async () => {
  const bundle = await createReleaseBundle();
  assert.equal(bundle.envId, "lewis-healthy-d4glgqqzv73a5bc10");
  assert.equal(bundle.commit.length, 40);
  assert.equal(bundle.status, "dirty_candidate");
  const names = new Set(bundle.functions.map((entry) => entry.name));
  for (const name of ["vision-analysis-dispatcher", "vision-analysis-worker", "vision-analysis-reaper"]) {
    assert.equal(names.has(name), true);
  }
  const dispatcher = bundle.functions.find((entry) => entry.name === "vision-analysis-dispatcher");
  const worker = bundle.functions.find((entry) => entry.name === "vision-analysis-worker");
  assert.equal(worker.artifactSource, "staged_function_directory_with_get_login_ticket_runtime");
  assert.ok(worker.localArtifact.files.some((file) => file.path === "get-login-ticket/index.js"));
  assert.equal(dispatcher.localArtifact.sha256.length, 64);
  assert.equal(dispatcher.trigger.currentReadback, "NOT_VERIFIED");
  assert.equal(dispatcher.productionReadback.status, "NOT_VERIFIED");
});
