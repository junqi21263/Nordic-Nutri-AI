import assert from "node:assert/strict";
import test from "node:test";
import dispatcher from "./index.js";

const { purgeOnce } = dispatcher;

test("scheduled purge asks the signed internal route to remove expired deletion audit logs", async () => {
  const requests = [];
  await purgeOnce({
    endpoint: "https://example.com",
    secret: "shared-secret",
    limit: 25,
    now: () => 1_000_000,
    request: async (url, init) => {
      requests.push({ url, ...init });
      return { ok: true, text: async () => JSON.stringify({ deleted: 0 }) };
    },
  });

  assert.deepEqual(JSON.parse(requests[0].body), { limit: 25, purgeDeletionAudit: true });
});
