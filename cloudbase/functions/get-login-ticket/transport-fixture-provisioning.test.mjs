import assert from "node:assert/strict";
import test from "node:test";

import { createTransportFixtureProvisioner } from "./transport-fixture-provisioning.cjs";

const principal = { sub: "user-a-internal" };

function makeDeps(overrides = {}) {
  return {
    ownerFingerprintSecret: "local-only-secret",
    authenticate: async () => principal,
    findAppUsers: async () => [{ id: principal.sub }],
    findActiveFixtures: async () => [],
    createFixture: async (input) => ({
      fixtureAnalysisId: input.analysisId,
      fixtureJobId: input.jobId,
      clientRequestId: input.clientRequestId,
    }),
    cleanupFixture: async () => ({ removed: true }),
    ...overrides,
  };
}

test("creates one fixture only after exactly one authenticated app user mapping", async () => {
  const calls = [];
  const provisioner = createTransportFixtureProvisioner(makeDeps({
    createFixture: async (input) => {
      calls.push(input);
      return { fixtureAnalysisId: input.analysisId, fixtureJobId: input.jobId, clientRequestId: input.clientRequestId };
    },
  }));

  const result = await provisioner.provision({ token: "opaque-token", testRunId: "run-1" });

  assert.equal(result.mappingCount, 1);
  assert.equal(result.ownerFingerprint.length, 64);
  assert.equal(calls.length, 1);
  assert.match(calls[0].clientRequestId, /^[0-9a-f-]{36}$/);
  assert.match(calls[0].traceId, /^transport-smoke-run-1$/);
  assert.equal(calls[0].userId, principal.sub);
  assert.equal(calls[0].dispatchState, "queued");
  assert.equal(calls[0].executionOwner, "none");
});

test("mapping count zero fails closed without creating a fixture", async () => {
  let writes = 0;
  const provisioner = createTransportFixtureProvisioner(makeDeps({
    findAppUsers: async () => [],
    createFixture: async () => { writes += 1; throw new Error("must not write"); },
  }));

  await assert.rejects(
    provisioner.provision({ token: "opaque-token", testRunId: "run-0" }),
    (error) => error.code === "TRANSPORT_FIXTURE_IDENTITY_NOT_UNIQUE",
  );
  assert.equal(writes, 0);
});

test("mapping count greater than one fails closed without choosing a row", async () => {
  let writes = 0;
  const provisioner = createTransportFixtureProvisioner(makeDeps({
    findAppUsers: async () => [{ id: "user-a" }, { id: "user-b" }],
    createFixture: async () => { writes += 1; throw new Error("must not write"); },
  }));

  await assert.rejects(
    provisioner.provision({ token: "opaque-token", testRunId: "run-many" }),
    (error) => error.code === "TRANSPORT_FIXTURE_IDENTITY_NOT_UNIQUE",
  );
  assert.equal(writes, 0);
});

test("an active transport fixture is reused and not duplicated", async () => {
  let writes = 0;
  const existing = {
    fixtureAnalysisId: "analysis-existing",
    fixtureJobId: "job-existing",
    clientRequestId: "00000000-0000-4000-8000-000000000001",
    ownerFingerprint: "f".repeat(64),
  };
  const provisioner = createTransportFixtureProvisioner(makeDeps({
    findActiveFixtures: async () => [existing],
    createFixture: async () => { writes += 1; return existing; },
  }));

  const result = await provisioner.provision({ token: "opaque-token", testRunId: "run-existing" });

  assert.equal(result.mappingCount, 1);
  assert.equal(result.reused, true);
  assert.equal(result.fixtureAnalysisId, existing.fixtureAnalysisId);
  assert.equal(result.fixtureJobId, existing.fixtureJobId);
  assert.equal(result.clientRequestId, existing.clientRequestId);
  assert.equal(writes, 0);
});

test("fixture creation errors are surfaced as rollback-safe failure", async () => {
  const provisioner = createTransportFixtureProvisioner(makeDeps({
    createFixture: async () => {
      const error = new Error("rpc rolled back");
      error.code = "TRANSPORT_FIXTURE_CREATE_FAILED";
      throw error;
    },
  }));

  await assert.rejects(
    provisioner.provision({ token: "opaque-token", testRunId: "run-fail" }),
    (error) => error.code === "TRANSPORT_FIXTURE_CREATE_FAILED",
  );
});

test("cleanup requires an exact fixture identity and returns no broad-delete operation", async () => {
  const calls = [];
  const provisioner = createTransportFixtureProvisioner(makeDeps({
    cleanupFixture: async (fixture) => { calls.push(fixture); return { removed: true }; },
  }));

  const result = await provisioner.cleanup({
    fixtureAnalysisId: "analysis-exact",
    fixtureJobId: "job-exact",
    clientRequestId: "00000000-0000-4000-8000-000000000002",
  });

  assert.deepEqual(result, { removed: true });
  assert.deepEqual(calls, [{
    fixtureAnalysisId: "analysis-exact",
    fixtureJobId: "job-exact",
    clientRequestId: "00000000-0000-4000-8000-000000000002",
    purpose: "transport_smoke",
  }]);
});
