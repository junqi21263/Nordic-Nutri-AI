import assert from "node:assert/strict";
import test from "node:test";

import { createHunyuanWorkerClient } from "./hunyuan-worker-client.cjs";

test("signs worker requests and returns the worker image result", async () => {
  const requests = [];
  const client = createHunyuanWorkerClient({
    endpoint: "https://dev-d8g3hqv2b0de38046.service.tcloudbase.com/hunyuan-image-worker/generate",
    sharedSecret: "worker-secret",
    now: () => 1_000_000,
    requestImpl: async (request) => {
      requests.push(request);
      return {
        statusCode: 200,
        body: JSON.stringify({ data: [{ url: "https://temporary.example/image.png" }] }),
      };
    },
  });

  const result = await client.generateImage({
    model: "HY-Image-3.0-Plus-4090-Tob-v1.0",
    prompt: "A Nordic plate of boiled chicken breast",
    size: "1280x720",
    seed: 123,
  });

  assert.deepEqual(result, { data: [{ url: "https://temporary.example/image.png" }] });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://dev-d8g3hqv2b0de38046.service.tcloudbase.com/hunyuan-image-worker/generate");
  assert.equal(requests[0].headers["x-nordic-worker-timestamp"], "1000000");
  assert.match(requests[0].headers["x-nordic-worker-signature"], /^[a-f0-9]{64}$/);
  assert.deepEqual(JSON.parse(requests[0].body), {
    model: "HY-Image-3.0-Plus-4090-Tob-v1.0",
    prompt: "A Nordic plate of boiled chicken breast",
    size: "1280x720",
    seed: 123,
  });
});

test("rejects a non-HTTPS worker endpoint", () => {
  assert.throws(
    () => createHunyuanWorkerClient({ endpoint: "http://localhost:9000/generate", sharedSecret: "worker-secret" }),
    /HTTPS endpoint/,
  );
});
