import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertBranchMatchesTarget,
  getDeploymentConfig,
  resolveDeploymentTarget,
} from "./cloudbase-deploy-config.mjs";

test("selects the test environment without changing the production manifest", async () => {
  const target = resolveDeploymentTarget("test");
  const productionManifest = JSON.parse(await readFile(new URL("../cloudbaserc.json", import.meta.url), "utf8"));
  const config = getDeploymentConfig(productionManifest, target);

  assert.equal(target.envId, "test-dev-d4gyxnn0b5dfa2c8a");
  assert.equal(config.envId, target.envId);
  assert.deepEqual(config.functions, productionManifest.functions);
  assert.equal(productionManifest.envId, "lewis-healthy-d4glgqqzv73a5bc10");
});

test("selects production explicitly and rejects unknown targets", () => {
  const production = resolveDeploymentTarget("production");
  assert.equal(production.envId, "lewis-healthy-d4glgqqzv73a5bc10");
  assert.throws(() => resolveDeploymentTarget("staging"), /test or production/);
});

test("enforces the documented branch-to-environment mapping", () => {
  assert.doesNotThrow(() => assertBranchMatchesTarget("feature/profile", resolveDeploymentTarget("test")));
  assert.doesNotThrow(() => assertBranchMatchesTarget("release/2026-09", resolveDeploymentTarget("production")));
  assert.throws(() => assertBranchMatchesTarget("Android-dev", resolveDeploymentTarget("test")), /not allowed/);
});
