import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";

import { createHttpServer } from "./index.js";

async function withServer(server, run) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test("only accepts JSON POST requests and never exposes OpenID", async () => {
  const server = createHttpServer({
    service: {
      issue: async ({ code }) => ({
        user: { id: `user:${code}` },
        session: { accessToken: "product-session" },
        onboardingRequired: true,
      }),
    },
  });

  await withServer(server, async (baseUrl) => {
    const unsupported = await fetch(baseUrl, { method: "GET" });
    assert.equal(unsupported.status, 405);

    const response = await fetch(baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "fresh-code" }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      user: { id: "user:fresh-code" },
      session: { accessToken: "product-session" },
      onboardingRequired: true,
    });
  });
});

test("returns a generic configuration error without booting a fallback login path", async () => {
  const server = createHttpServer({ service: null });

  await withServer(server, async (baseUrl) => {
    const response = await fetch(baseUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: "fresh-code" }),
    });
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { code: "LOGIN_SERVICE_NOT_CONFIGURED" });
  });
});

test("writes product data only with a valid product session", async () => {
  const server = createHttpServer({
    service: {
      issue: async () => { throw new Error("not used"); },
      verifySession: (token) => token === "valid-session" ? { sub: "user-1" } : null,
      data: { saveProfile: async (userId, body) => ({ id: userId, nickname: body.nickname }) },
    },
  });

  await withServer(server, async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/get-login-ticket/profile`, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nickname: "Lewis" }),
    });
    assert.equal(unauthorized.status, 401);
    assert.deepEqual(await unauthorized.json(), { code: "UNAUTHORIZED" });

    const response = await fetch(`${baseUrl}/get-login-ticket/profile`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer valid-session" },
      body: JSON.stringify({ nickname: "Lewis", userId: "attacker-controlled" }),
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { id: "user-1", nickname: "Lewis" });
  });
});

test("reads the signed-in account without accepting a client user id", async () => {
  const server = createHttpServer({
    service: {
      verifySession: (token) => token === "valid-session" ? { sub: "user-1" } : null,
      data: { getAccount: async (userId) => ({ userId, nickname: "Lewis" }) },
    },
  });

  await withServer(server, async (baseUrl) => {
    const unauthorized = await fetch(`${baseUrl}/get-login-ticket/account`);
    assert.equal(unauthorized.status, 401);

    const response = await fetch(`${baseUrl}/get-login-ticket/account`, {
      headers: { authorization: "Bearer valid-session" },
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { userId: "user-1", nickname: "Lewis" });
  });
});
