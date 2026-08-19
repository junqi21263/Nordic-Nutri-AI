import assert from "node:assert/strict";
import test from "node:test";

import {
  createTransportFixtureInternalHandler,
  signTransportFixtureRequest,
} from "./transport-fixture-integration.cjs";
import { createHttpServer } from "./index.js";

const secret = "transport-local-secret";
const path = "/api/internal/vision-analysis/transport-fixture/provision";

function request(body, { signatureSecret = secret, token = "valid-token" } = {}) {
  const rawBody = JSON.stringify({ ...body, token });
  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    method: "POST",
    path,
    rawBody,
    body: JSON.parse(rawBody),
    headers: signatureSecret
      ? {
        "x-vision-transport-timestamp": timestamp,
        "x-vision-transport-signature": signTransportFixtureRequest(signatureSecret, {
          timestamp,
          method: "POST",
          path,
          body: rawBody,
        }),
      }
      : {},
  };
}

function makeHandler(overrides = {}) {
  const calls = [];
  const handler = createTransportFixtureInternalHandler({
    secret,
    authenticate: async (token) => {
      calls.push(["authenticate", token]);
      if (token !== "valid-token") {
        const error = new Error("invalid auth");
        error.code = "UNAUTHORIZED";
        throw error;
      }
      return { sub: "user-a" };
    },
    provision: async (input) => {
      calls.push(["provision", input]);
      return {
        fixtureAnalysisId: "analysis-1",
        fixtureJobId: "job-1",
        clientRequestId: "transport-smoke-1",
        ownerFingerprint: "a".repeat(64),
        mappingCount: 1,
      };
    },
    cleanup: async (input) => {
      calls.push(["cleanup", input]);
      return { removed: true };
    },
    ...overrides,
  });
  return { handler, calls };
}

async function withServer(server, run) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("rejects missing or invalid HMAC before resolving authentication", async () => {
  const { handler, calls } = makeHandler();
  const result = await handler({ ...request({ testRunId: "run-1" }, { signatureSecret: null }), headers: {} });
  assert.deepEqual(result, { status: 401, body: { code: "UNAUTHORIZED" } });
  assert.deepEqual(calls, []);
});

test("rejects invalid token without provisioning", async () => {
  const { handler, calls } = makeHandler();
  const result = await handler(request({ testRunId: "run-2" }, { token: "bad-token" }));
  assert.deepEqual(result, { status: 401, body: { code: "UNAUTHORIZED" } });
  assert.deepEqual(calls, [["authenticate", "bad-token"]]);
});

test("provisions only after HMAC and authentication succeed and returns safe fields", async () => {
  const { handler, calls } = makeHandler();
  const result = await handler(request({ testRunId: "run-3" }));
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, {
    fixtureAnalysisId: "analysis-1",
    fixtureJobId: "job-1",
    clientRequestId: "transport-smoke-1",
    ownerFingerprint: "a".repeat(64),
    mappingStatus: "unique",
  });
  assert.deepEqual(calls, [
    ["authenticate", "valid-token"],
    ["provision", { token: "valid-token", testRunId: "run-3", principal: { sub: "user-a" } }],
  ]);
  assert.equal("userId" in result.body, false);
});

test("propagates fail-closed provisioning errors without exposing details", async () => {
  const { handler } = makeHandler({
    provision: async () => {
      const error = new Error("mapping count was 0");
      error.code = "TRANSPORT_FIXTURE_IDENTITY_NOT_UNIQUE";
      throw error;
    },
  });
  const result = await handler(request({ testRunId: "run-4" }));
  assert.deepEqual(result, { status: 409, body: { code: "TRANSPORT_FIXTURE_IDENTITY_NOT_UNIQUE" } });
});

test("cleanup requires HMAC and forwards only exact fixture identity", async () => {
  const cleanupPath = "/api/internal/vision-analysis/transport-fixture/cleanup";
  const { handler, calls } = makeHandler();
  const rawBody = JSON.stringify({
    fixtureAnalysisId: "analysis-1",
    fixtureJobId: "job-1",
    clientRequestId: "transport-smoke-1",
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const result = await handler({
    method: "POST",
    path: cleanupPath,
    rawBody,
    body: JSON.parse(rawBody),
    headers: {
      "x-vision-transport-timestamp": timestamp,
      "x-vision-transport-signature": signTransportFixtureRequest(secret, { timestamp, method: "POST", path: cleanupPath, body: rawBody }),
    },
  });
  assert.deepEqual(result, { status: 200, body: { removed: true } });
  assert.deepEqual(calls, [["cleanup", {
    fixtureAnalysisId: "analysis-1",
    fixtureJobId: "job-1",
    clientRequestId: "transport-smoke-1",
  }]]);
});

test("wires the production HTTP route with HMAC-before-auth and safe response", async () => {
  const calls = [];
  const server = createHttpServer({
    service: {
      visionTransportFixtureSecret: secret,
      transportFixtureProvisioning: {
        provision: async (input) => {
          calls.push(input);
          return {
            fixtureAnalysisId: "analysis-2",
            fixtureJobId: "job-2",
            clientRequestId: "transport-smoke-2",
            ownerFingerprint: "b".repeat(64),
            mappingCount: 1,
          };
        },
      },
    },
  });
  await withServer(server, async (baseUrl) => {
    const path = "/get-login-ticket/api/internal/vision-analysis/transport-fixture/provision";
    const body = JSON.stringify({ token: "valid-token", testRunId: "run-http" });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const headers = {
      "content-type": "application/json",
      "x-vision-transport-timestamp": timestamp,
      "x-vision-transport-signature": signTransportFixtureRequest(secret, {
        timestamp, method: "POST", path: "/api/internal/vision-analysis/transport-fixture/provision", body,
      }),
    };
    const unauthorized = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body });
    assert.equal(unauthorized.status, 401);
    assert.deepEqual(await unauthorized.json(), { code: "UNAUTHORIZED" });

    const response = await fetch(`${baseUrl}${path}`, { method: "POST", headers, body });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      fixtureAnalysisId: "analysis-2",
      fixtureJobId: "job-2",
      clientRequestId: "transport-smoke-2",
      ownerFingerprint: "b".repeat(64),
      mappingStatus: "unique",
    });
  });
  assert.deepEqual(calls, [{ token: "valid-token", testRunId: "run-http" }]);
});
