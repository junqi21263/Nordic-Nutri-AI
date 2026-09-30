export const deploymentTargets = Object.freeze({
  test: Object.freeze({ envId: "test-dev-d4gyxnn0b5dfa2c8a", branches: ["develop", "feature/"] }),
  production: Object.freeze({ envId: "lewis-healthy-d4glgqqzv73a5bc10", branches: ["main", "release/"] }),
});

export function resolveDeploymentTarget(name) {
  const target = deploymentTargets[name];
  if (!target) throw new Error("Choose a deployment target: test or production");
  return { name, ...target };
}

export function getDeploymentConfig(manifest, target) {
  return { ...manifest, envId: target.envId };
}

export function assertBranchMatchesTarget(branch, target) {
  if (!isBranchAllowedForTarget(branch, target)) {
    throw new Error(`Branch "${branch}" is not allowed to deploy to ${target.name}; see docs/ENVIRONMENT_RELEASE_RULES.md`);
  }
}

export function isBranchAllowedForTarget(branch, target) {
  return target.branches.some((allowed) =>
    allowed.endsWith("/") ? branch.startsWith(allowed) : branch === allowed,
  );
}
