import assert from "node:assert/strict";
import test from "node:test";

import { readApiTestConfig, requireProductTokens } from "./config.mjs";

test("readApiTestConfig blocks persistent writes outside an explicitly confirmed sandbox", () => {
  assert.throws(
    () => readApiTestConfig({
      API_BASE_URL: "https://example.test/get-login-ticket",
      ALLOW_PERSISTENT_WRITES: "1",
      TEST_ENV_CONFIRMATION: "production",
    }),
    /TEST_ENV_CONFIRMATION must equal sandbox/,
  );
});

test("readApiTestConfig accepts a read-only live endpoint without credentials", () => {
  assert.deepEqual(
    readApiTestConfig({ API_BASE_URL: "https://example.test/get-login-ticket" }),
    {
      apiBaseUrl: "https://example.test/get-login-ticket",
      allowPersistentWrites: false,
      productTokenA: null,
      productTokenB: null,
      runId: null,
    },
  );
});

test("requireProductTokens rejects an authenticated suite without two isolated test sessions", () => {
  assert.throws(
    () => requireProductTokens({ productTokenA: "test-a", productTokenB: null }),
    /TEST_PRODUCT_TOKEN_A and TEST_PRODUCT_TOKEN_B are required/,
  );
});
