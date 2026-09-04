import assert from "node:assert/strict";
import test from "node:test";

import { createGoogleVerifier } from "./services/google.cjs";

test("google verifier returns only verified identity claims", async () => {
  const verifier = createGoogleVerifier({
    audience: "android-client-id",
    verifyIdToken: async (idToken, audience) => {
      assert.equal(idToken, "id-token");
      assert.equal(audience, "android-client-id");
      return {
        getPayload: () => ({
          sub: "google-sub-1",
          email: "User@Example.com",
          email_verified: true,
          iss: "https://accounts.google.com",
          aud: "android-client-id",
          exp: Math.floor(Date.now() / 1000) + 60,
        }),
      };
    },
  });

  assert.deepEqual(await verifier.verify("id-token"), {
    sub: "google-sub-1",
    email: "User@Example.com",
    email_verified: true,
  });
});

test("google verifier rejects an invalid issuer or audience", async () => {
  const verifier = createGoogleVerifier({
    audience: "android-client-id",
    verifyIdToken: async () => ({
      getPayload: () => ({
        sub: "google-sub-1",
        email: "user@example.com",
        iss: "https://evil.example.com",
        aud: "other-client-id",
        exp: Math.floor(Date.now() / 1000) + 60,
      }),
    }),
  });

  await assert.rejects(() => verifier.verify("id-token"), (error) => error.code === "AUTH_GOOGLE_TOKEN_INVALID");
});
