import assert from "node:assert/strict";
import test from "node:test";
import { dispatchOnce } from "./index.js";

test("calls the protected reminder dispatch endpoint", async () => {
  const calls = [];
  const result = await dispatchOnce({ endpoint: "https://example.test/get-login-ticket", secret: "secret", request: async (url, options) => {
    calls.push({ url, options });
    return { ok: true, status: 200, text: async () => JSON.stringify({ due: 1, sent: 1, skipped: 0 }) };
  }});
  assert.equal(calls[0].url, "https://example.test/get-login-ticket/api/internal/push-reminders/dispatch");
  assert.deepEqual(result, { due: 1, sent: 1, skipped: 0 });
});
