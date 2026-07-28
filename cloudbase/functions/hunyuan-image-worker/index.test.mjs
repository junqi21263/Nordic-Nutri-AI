import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { createWorkerHttpServer, readWorkerConfig } from "./index.js";

async function withServer(server, run) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

function signedHeaders(secret, body, timestamp = Date.now()) {
  const value = String(timestamp);
  return {
    "content-type": "application/json",
    "x-nordic-worker-timestamp": value,
    "x-nordic-worker-signature": createHmac("sha256", secret).update(`${value}.${body}`).digest("hex"),
  };
}

test("requires the worker environment id and shared secret", () => {
  assert.throws(
    () => readWorkerConfig({ TCB_ENV: "dev-env" }),
    /Worker configuration is incomplete/,
  );
});

test("accepts a valid signed generation request without trusting the caller model", async () => {
  const calls = [];
  const server = createWorkerHttpServer({
    sharedSecret: "test-shared-secret",
    service: {
      generate: async (input) => {
        calls.push(input);
        return { data: [{ url: "https://temporary.example/image.png", revised_prompt: "revised" }] };
      },
    },
  });
  const body = JSON.stringify({
    model: "caller-controlled-model",
    prompt: "A Nordic plate of boiled chicken breast",
    size: "1280x720",
    seed: 123,
  });

  await withServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/generate`, {
      method: "POST",
      headers: signedHeaders("test-shared-secret", body),
      body,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      data: [{ url: "https://temporary.example/image.png", revised_prompt: "revised" }],
    });
  });

  assert.deepEqual(calls, [{
    prompt: "A Nordic plate of boiled chicken breast",
    size: "1280x720",
    seed: 123,
  }]);
});

test("rejects unsigned and stale generation requests", async () => {
  const server = createWorkerHttpServer({
    sharedSecret: "test-shared-secret",
    service: { generate: async () => ({ data: [] }) },
    now: () => 1_000_000,
  });
  const body = JSON.stringify({ prompt: "food", size: "1280x720" });

  await withServer(server, async (baseUrl) => {
    const unsigned = await fetch(`${baseUrl}/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    assert.equal(unsigned.status, 401);
    assert.deepEqual(await unsigned.json(), { code: "WORKER_UNAUTHORIZED" });

    const stale = await fetch(`${baseUrl}/generate`, {
      method: "POST",
      headers: signedHeaders("test-shared-secret", body, 1_000_000 - 301_000),
      body,
    });
    assert.equal(stale.status, 401);
    assert.deepEqual(await stale.json(), { code: "WORKER_UNAUTHORIZED" });
  });
});
