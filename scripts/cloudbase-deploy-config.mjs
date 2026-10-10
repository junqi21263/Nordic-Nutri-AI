export const deploymentTargets = Object.freeze({
  test: Object.freeze({ envId: "test-dev-d4gyxnn0b5dfa2c8a", branches: ["develop", "feature/", "Android-dev"] }),
  production: Object.freeze({ envId: "lewis-healthy-d4glgqqzv73a5bc10", branches: ["main", "release/", "Android-prod"] }),
});

const developmentOnlyFunctions = [
  {
    name: "nutrition-insight-worker",
    type: "HTTP",
    timeout: 60,
    runtime: "Nodejs18.15",
    handler: "index.main",
    installDependency: true,
    ignore: ["*.test.mjs", "node_modules/**", ".git/**"],
  },
  {
    name: "hunyuan-image-worker",
    type: "HTTP",
    timeout: 900,
    runtime: "Nodejs18.15",
    installDependency: true,
    ignore: ["*.test.mjs", ".git/**"],
  },
];

export function resolveDeploymentTarget(name) {
  const target = deploymentTargets[name];
  if (!target) throw new Error("Choose a deployment target: test or production");
  return { name, ...target };
}

export function getDeploymentConfig(manifest, target) {
  return {
    ...manifest,
    envId: target.envId,
    functions: target.name === "test" ? [...manifest.functions, ...developmentOnlyFunctions] : manifest.functions,
  };
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
