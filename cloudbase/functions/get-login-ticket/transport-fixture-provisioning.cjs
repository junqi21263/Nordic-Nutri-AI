const crypto = require("node:crypto");

const TRANSPORT_PREFIX = "transport-smoke-";
const DEFAULT_TTL_MS = 5 * 60 * 1000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fail(code, message = code) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function ownerFingerprint(secret, userId) {
  return crypto.createHmac("sha256", String(secret)).update(String(userId)).digest("hex");
}

function createTransportFixtureProvisioner({
  authenticate,
  findAppUsers,
  findActiveFixtures,
  createFixture,
  cleanupFixture,
  ownerFingerprintSecret,
  now = () => Date.now(),
  ttlMs = DEFAULT_TTL_MS,
} = {}) {
  if (typeof authenticate !== "function"
    || typeof findAppUsers !== "function"
    || typeof findActiveFixtures !== "function"
    || typeof createFixture !== "function"
    || typeof cleanupFixture !== "function"
    || !ownerFingerprintSecret) {
    throw new Error("TRANSPORT_FIXTURE_DEPENDENCIES_MISSING");
  }

  return {
    async provision({ token, testRunId } = {}) {
      if (typeof token !== "string" || !token.trim()) throw fail("TRANSPORT_FIXTURE_AUTH_REQUIRED");
      if (typeof testRunId !== "string" || !testRunId.trim()) throw fail("TRANSPORT_FIXTURE_RUN_ID_REQUIRED");

      const principal = await authenticate(token);
      const principalId = principal?.sub;
      if (typeof principalId !== "string" || !principalId) throw fail("TRANSPORT_FIXTURE_AUTH_REQUIRED");

      const users = await findAppUsers(principalId);
      const mappingCount = Array.isArray(users) ? users.filter((row) => row?.id).length : 0;
      if (mappingCount !== 1) throw fail("TRANSPORT_FIXTURE_IDENTITY_NOT_UNIQUE");

      const userId = users[0].id;
      const fingerprint = ownerFingerprint(ownerFingerprintSecret, userId);
      const active = await findActiveFixtures({ userId, marker: TRANSPORT_PREFIX });
      if (Array.isArray(active) && active.length > 1) throw fail("TRANSPORT_FIXTURE_ACTIVE_DUPLICATE");
      if (active?.length === 1) {
        return {
          ...active[0],
          mappingCount,
          ownerFingerprint: fingerprint,
          reused: true,
        };
      }

      const clientRequestId = crypto.randomUUID();
      const traceId = `${TRANSPORT_PREFIX}${testRunId}`;
      const analysisId = crypto.randomUUID();
      const jobId = crypto.randomUUID();
      const deadlineAt = new Date(now() + Math.max(30_000, Number(ttlMs) || DEFAULT_TTL_MS)).toISOString();
      const created = await createFixture({
        purpose: "transport_smoke",
        userId,
        clientRequestId,
        traceId,
        analysisId,
        jobId,
        status: "analyzing",
        executionOwner: "none",
        dispatchState: "queued",
        version: 0,
        deadlineAt,
      });
      if (!created?.fixtureAnalysisId || !created?.fixtureJobId) {
        throw fail("TRANSPORT_FIXTURE_CREATE_INVALID");
      }
      return {
        ...created,
        mappingCount,
        ownerFingerprint: fingerprint,
        reused: false,
      };
    },

    async cleanup(fixture) {
      if (!fixture?.fixtureAnalysisId || !fixture?.fixtureJobId || !fixture?.clientRequestId) {
        throw fail("TRANSPORT_FIXTURE_ID_REQUIRED");
      }
      if (!UUID_RE.test(String(fixture.clientRequestId))) {
        throw fail("TRANSPORT_FIXTURE_CLIENT_REQUEST_ID_INVALID");
      }
      return cleanupFixture({
        fixtureAnalysisId: fixture.fixtureAnalysisId,
        fixtureJobId: fixture.fixtureJobId,
        clientRequestId: fixture.clientRequestId,
        purpose: "transport_smoke",
      });
    },
  };
}

module.exports = {
  TRANSPORT_PREFIX,
  createTransportFixtureProvisioner,
};
