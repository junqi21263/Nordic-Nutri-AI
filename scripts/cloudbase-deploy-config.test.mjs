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
  assert.deepEqual(config.functions.slice(0, productionManifest.functions.length), productionManifest.functions);
  assert.deepEqual(config.functions.slice(productionManifest.functions.length).map((entry) => entry.name), [
    "nutrition-insight-worker",
    "hunyuan-image-worker",
  ]);
  assert.equal(productionManifest.envId, "lewis-healthy-d4glgqqzv73a5bc10");
});

test("selects production explicitly and rejects unknown targets", () => {
  const production = resolveDeploymentTarget("production");
  assert.equal(production.envId, "lewis-healthy-d4glgqqzv73a5bc10");
  assert.throws(() => resolveDeploymentTarget("staging"), /test or production/);
});

test("production configuration never includes Dev-only workers", async () => {
  const manifest = JSON.parse(await readFile(new URL("../cloudbaserc.json", import.meta.url), "utf8"));
  const config = getDeploymentConfig(manifest, resolveDeploymentTarget("production"));
  assert.deepEqual(config.functions, manifest.functions);
});

test("enforces the documented branch-to-environment mapping", () => {
  assert.doesNotThrow(() => assertBranchMatchesTarget("feature/profile", resolveDeploymentTarget("test")));
  assert.doesNotThrow(() => assertBranchMatchesTarget("Android-dev", resolveDeploymentTarget("test")));
  assert.doesNotThrow(() => assertBranchMatchesTarget("release/2026-09", resolveDeploymentTarget("production")));
  assert.doesNotThrow(() => assertBranchMatchesTarget("Android-prod", resolveDeploymentTarget("production")));
  assert.throws(() => assertBranchMatchesTarget("Android-prod", resolveDeploymentTarget("test")), /not allowed/);
  assert.throws(() => assertBranchMatchesTarget("Android-dev", resolveDeploymentTarget("production")), /not allowed/);
});
