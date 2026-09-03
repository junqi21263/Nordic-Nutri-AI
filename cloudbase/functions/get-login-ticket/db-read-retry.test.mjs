import assert from "node:assert/strict";
import test from "node:test";
import { withDbReadRetry } from "./db-read-retry.cjs";

test("retries one transient database read failure and returns the next result", async () => {
  let attempts = 0;
  const result = await withDbReadRetry(async () => {
    attempts += 1;
    return attempts === 1
      ? { data: null, error: { message: "connection timeout" } }
      : { data: [{ id: "ok" }], error: null };
  }, { delayMs: 0 });

  assert.equal(attempts, 2);
  assert.deepEqual(result.data, [{ id: "ok" }]);
  assert.equal(result.error, null);
});

test("does not retry a non-transient database error", async () => {
  let attempts = 0;
  const result = await withDbReadRetry(async () => {
    attempts += 1;
    return { data: null, error: { message: "column does not exist" } };
  }, { delayMs: 0 });

  assert.equal(attempts, 1);
  assert.equal(result.error.message, "column does not exist");
});
