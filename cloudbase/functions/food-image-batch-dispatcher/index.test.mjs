import assert from "node:assert/strict";
import test from "node:test";

import dispatcherModule from "./index.js";

const { dispatchOnce, main, makeSignature } = dispatcherModule;

test("dispatchOnce signs the internal request and forwards the configured work limit", async () => {
  const calls = [];
  const result = await dispatchOnce({
    endpoint: "https://example.test/get-login-ticket",
    secret: "dispatch-test-secret",
    maxItems: 3,
    now: () => 1_700_000_000_000,
    request: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, text: async () => JSON.stringify({ dispatched: 3, attempted: 3 }) };
    },
  });

  assert.deepEqual(result, { dispatched: 3, attempted: 3 });
  assert.equal(calls[0].url, "https://example.test/get-login-ticket/api/internal/food-image-batches/dispatch");
  assert.equal(calls[0].options.headers["x-food-image-dispatch-timestamp"], "1700000000");
  assert.equal(calls[0].options.headers["x-food-image-dispatch-signature"], makeSignature("dispatch-test-secret", {
    timestamp: "1700000000", path: "/api/internal/food-image-batches/dispatch", body: JSON.stringify({ maxItems: 3 }),
  }));
  assert.equal(calls[0].options.body, JSON.stringify({ maxItems: 3 }));
});

test("dispatchOnce refuses to run without the private dispatch configuration", async () => {
  await assert.rejects(
    () => dispatchOnce({ endpoint: "", secret: "" }),
    /FOOD_IMAGE_DISPATCH_CONFIG_MISSING/,
  );
});

test("exports the CloudBase event handler from the final module object", () => {
  assert.equal(typeof main, "function");
});
