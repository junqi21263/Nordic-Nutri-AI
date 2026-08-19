const crypto = require("node:crypto");

function signTransportFixtureRequest(secret, { timestamp, method = "POST", path, body = "" } = {}) {
  const canonical = `${timestamp}\n${String(method).toUpperCase()}\n${path}\n${body}`;
  return crypto.createHmac("sha256", String(secret || "")).update(canonical).digest("hex");
}

function verifyTransportFixtureSignature(secret, request, { path, body, now = Date.now() } = {}) {
  if (!secret || !path) return false;
  const timestamp = String(request?.headers?.["x-vision-transport-timestamp"] || "");
  const signature = String(request?.headers?.["x-vision-transport-signature"] || "");
  const numericTimestamp = Number(timestamp);
  if (!Number.isInteger(numericTimestamp) || Math.abs(Math.floor(now / 1000) - numericTimestamp) > 300) return false;
  const expected = signTransportFixtureRequest(secret, { timestamp, method: request.method, path, body });
  const expectedBuffer = Buffer.from(expected, "utf8");
  const actualBuffer = Buffer.from(signature, "utf8");
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function safeProvisionResponse(result) {
  return {
    fixtureAnalysisId: result?.fixtureAnalysisId,
    fixtureJobId: result?.fixtureJobId,
    clientRequestId: result?.clientRequestId,
    ownerFingerprint: result?.ownerFingerprint,
    mappingStatus: result?.mappingCount === 1 ? "unique" : "unknown",
  };
}

function createTransportFixtureInternalHandler({ secret, authenticate, provision, cleanup, now = Date.now } = {}) {
  if (typeof authenticate !== "function" || typeof provision !== "function" || typeof cleanup !== "function") {
    throw new Error("TRANSPORT_FIXTURE_ROUTE_DEPENDENCIES_MISSING");
  }
  return async function handle(request = {}) {
    const isCleanup = request.path === "/api/internal/vision-analysis/transport-fixture/cleanup";
    const isProvision = request.path === "/api/internal/vision-analysis/transport-fixture/provision";
    if (request.method !== "POST" || (!isCleanup && !isProvision)) {
      return { status: 404, body: { code: "NOT_FOUND" } };
    }
    if (!verifyTransportFixtureSignature(secret, request, {
      path: request.path,
      body: request.rawBody,
      now: now(),
    })) {
      return { status: 401, body: { code: "UNAUTHORIZED" } };
    }
    try {
      if (isCleanup) {
        const result = await cleanup({
          fixtureAnalysisId: request.body?.fixtureAnalysisId,
          fixtureJobId: request.body?.fixtureJobId,
          clientRequestId: request.body?.clientRequestId,
        });
        return { status: 200, body: { removed: result?.removed === true } };
      }
      const principal = await authenticate(request.body?.token);
      const result = await provision({
        token: request.body?.token,
        testRunId: request.body?.testRunId,
        principal,
      });
      return { status: 200, body: safeProvisionResponse(result) };
    } catch (error) {
      const code = /^[A-Z0-9_:-]{1,80}$/.test(String(error?.code || ""))
        ? error.code
        : "TRANSPORT_FIXTURE_UNAVAILABLE";
      const status = code === "UNAUTHORIZED" ? 401 : code.includes("IDENTITY") || code.includes("ACTIVE") ? 409 : 503;
      return { status, body: { code } };
    }
  };
}

function createTransportFixtureDbAdapter({ db } = {}) {
  if (!db || typeof db.from !== "function" || typeof db.rpc !== "function") {
    throw new Error("TRANSPORT_FIXTURE_DB_DEPENDENCIES_MISSING");
  }
  return {
    async findAppUsers(principalId) {
      const query = db.from("app_users").select("id").eq("id", principalId);
      const result = await query;
      if (result?.error) throw result.error;
      return Array.isArray(result?.data) ? result.data : result?.data ? [result.data] : [];
    },
    async findActiveFixtures({ userId, marker }) {
      const result = await db.rpc("find_active_transport_fixtures", { p_user_id: userId, p_trace_prefix: marker });
      if (result?.error) throw result.error;
      return Array.isArray(result?.data) ? result.data : result?.data ? [result.data] : [];
    },
    async createFixture(input) {
      const result = await db.rpc("create_transport_fixture", {
        p_user_id: input.userId,
        p_analysis_id: input.analysisId,
        p_job_id: input.jobId,
        p_client_request_id: input.clientRequestId,
        p_trace_id: input.traceId,
        p_deadline_at: input.deadlineAt,
        p_purpose: input.purpose,
      });
      if (result?.error) throw result.error;
      const row = Array.isArray(result?.data) ? result.data[0] : result?.data;
      return row ? {
        fixtureAnalysisId: row.fixture_analysis_id ?? row.analysis_id,
        fixtureJobId: row.fixture_job_id ?? row.job_id,
        clientRequestId: row.client_request_id ?? input.clientRequestId,
      } : null;
    },
    async cleanupFixture(input) {
      const result = await db.rpc("cleanup_transport_fixture", {
        p_analysis_id: input.fixtureAnalysisId,
        p_job_id: input.fixtureJobId,
        p_client_request_id: input.clientRequestId,
        p_purpose: input.purpose || "transport_smoke",
      });
      if (result?.error) throw result.error;
      return { removed: true };
    },
  };
}

module.exports = {
  createTransportFixtureDbAdapter,
  createTransportFixtureInternalHandler,
  safeProvisionResponse,
  signTransportFixtureRequest,
  verifyTransportFixtureSignature,
};
