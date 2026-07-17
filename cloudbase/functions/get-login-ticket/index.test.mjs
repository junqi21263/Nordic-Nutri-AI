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
      issue: async ({ code }) => ({ ticket: `ticket:${code}`, identityProof: "proof" }),
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
      ticket: "ticket:fresh-code",
      identityProof: "proof",
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
    assert.deepEqual(await response.json(), { code: "TICKET_SERVICE_NOT_CONFIGURED" });
  });
});
