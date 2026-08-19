import assert from "node:assert/strict";
import test from "node:test";

import { reapOnce } from "./index.js";

test("vision reaper calls the internal lease-reclaim route", async () => {
  const calls = [];
  const result = await reapOnce({
    endpoint: "https://example.test/get-login-ticket",
    secret: "vision-reaper-secret",
    now: () => 1_700_000_000_000,
    request: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, text: async () => JSON.stringify({ reclaimed: 2 }) };
    },
  });
  assert.deepEqual(result, { reclaimed: 2 });
  assert.equal(calls[0].url, "https://example.test/get-login-ticket/api/internal/vision-analysis/reap");
});
