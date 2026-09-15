import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync, sign } from "node:crypto";
import { createRequire } from "node:module";
import { createGoogleTokenService } from "./google.cjs";
const { OAuth2Client } = createRequire(import.meta.url)("google-auth-library");
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const certs = { fixture: keys.publicKey.export({ type: "spki", format: "pem" }) };
const now = Math.floor(Date.now() / 1000);
function token(overrides = {}, key = keys.privateKey) {
  const payload = { sub: "original-google-sub", email: "fixture@example.com", email_verified: true, iss: "https://accounts.google.com", aud: "expected-client", iat: now - 60, exp: now + 3600, ...overrides };
  const input = [ { alg: "RS256", kid: "fixture" }, payload ].map(value => Buffer.from(JSON.stringify(value)).toString("base64url")).join(".");
  return `${input}.${sign("RSA-SHA256", Buffer.from(input), key).toString("base64url")}`;
}

test("relay changes only certificate retrieval; real Google library verifies claims and signature", async (t) => {
  t.mock.method(OAuth2Client.prototype, "getFederatedSignonCertsAsync", async function () {
    assert.equal(this.endpoints.oauth2FederatedSignonPemCertsUrl, "https://keys.example/google/certs/pem");
    assert.equal(this.endpoints.oauth2FederatedSignonJwkCertsUrl, "https://keys.example/google/certs/jwk");
    return { certs, format: "PEM" };
  });
  const service = createGoogleTokenService({ clientId: "expected-client", certificatesBaseUrl: "https://keys.example" });
  assert.equal((await service.verifyIdToken(token())).sub, "original-google-sub");
  for (const claims of [{ aud: "wrong-client" }, { iss: "https://attacker.example" }, { exp: now - 1000, iat: now - 2000 }, { email_verified: false }]) {
    await assert.rejects(service.verifyIdToken(token(claims)), error => error.code === "AUTH_INVALID_CREDENTIALS");
  }
  const otherKey = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey;
  await assert.rejects(service.verifyIdToken(token({}, otherKey)), error => error.code === "AUTH_INVALID_CREDENTIALS");
  const parts = token().split(".");
  parts[0] = Buffer.from(JSON.stringify({ alg: "RS256", kid: "unknown" })).toString("base64url");
  await assert.rejects(service.verifyIdToken(parts.join(".")), error => error.authReason === "signing_key_unknown");
});

test("certificate fetch failure fails closed without CloudBase or tokeninfo fallback", async (t) => {
  t.mock.method(OAuth2Client.prototype, "getFederatedSignonCertsAsync", async () => {
    throw new Error("Failed to retrieve verification certificates: 503");
  });
  const service = createGoogleTokenService({
    clientId: "expected-client", certificatesBaseUrl: "https://keys.example", cloudbaseAuthEnvId: "test-env",
    cloudbaseIdTokenRequest: async () => assert.fail("unexpected provider call"),
    cloudbaseProviderRequest: async () => assert.fail("unexpected provider call"),
    fetchImpl: async () => assert.fail("unexpected tokeninfo call"),
  });
  await assert.rejects(service.verifyIdToken(token()), error => error.code === "AUTH_PROVIDER_UNAVAILABLE");
});
