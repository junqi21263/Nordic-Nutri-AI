import assert from "node:assert/strict";
import test from "node:test";

import { createGoogleTokenService } from "./google.cjs";

test("verifies Google ID tokens for the configured server client", async () => {
  const calls = [];
  const service = createGoogleTokenService({
    clientId: "server-client-id",
    client: {
      async verifyIdToken(input) {
        calls.push(input);
        return { getPayload: () => ({ sub: "google-sub", email: "user@example.com", email_verified: true, iss: "https://accounts.google.com" }) };
      },
    },
  });
  assert.deepEqual(await service.verifyIdToken("id-token"), { sub: "google-sub", email: "user@example.com", email_verified: true, iss: "https://accounts.google.com" });
  assert.deepEqual(calls, [{ idToken: "id-token", audience: "server-client-id" }]);
});
