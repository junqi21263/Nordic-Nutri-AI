import assert from "node:assert/strict";
import test from "node:test";
import https from "node:https";
import { EventEmitter } from "node:events";

import { createGoogleTokenService } from "./google.cjs";

test("does not mask Google transport failure with an earlier CloudBase rejection", async () => {
  const service = createGoogleTokenService({
    clientId: "server-client-id",
    client: { verifyIdToken: async () => { throw Object.assign(new Error("network"), { code: "ETIMEDOUT" }); } },
    cloudbaseAuthEnvId: "test-env",
    cloudbaseIdTokenRequest: async () => ({ ok: false, status: 400 }),
    cloudbaseProviderRequest: async () => ({ ok: false, status: 400 }),
    enableTokenInfoFallback: true,
    fetchImpl: async () => { throw new Error("network including secret-token"); },
  });
  await assert.rejects(service.verifyIdToken("secret-token"), error => {
    assert.equal(error.code, "AUTH_PROVIDER_UNAVAILABLE");
    assert.deepEqual(error.verificationAttempts.map(item => item.stage), [
      "google_library", "cloudbase_id_token", "cloudbase_provider_token", "google_tokeninfo",
    ]);
    assert.equal(error.verificationAttempts[1].code, "AUTH_INVALID_CREDENTIALS");
    assert.equal(error.verificationAttempts[3].code, "AUTH_PROVIDER_UNAVAILABLE");
    assert.ok(!JSON.stringify(error).includes("secret-token"));
    return true;
  });
});

test("default tokeninfo transport receives a numeric timeout and verifies the response", async (t) => {
  let requestCount = 0;
  t.mock.method(https, "request", (options, callback) => {
    assert.equal(typeof options.timeout, "number");
    assert.ok(Number.isFinite(options.timeout) && options.timeout > 0);
    requestCount++;
    const request = new EventEmitter();
    request.end = () => {
      const response = new EventEmitter();
      response.statusCode = 200;
      response.setEncoding = () => {};
      callback(response);
      response.emit("data", JSON.stringify({ sub: "google-sub", email: "user@example.com", email_verified: "true", iss: "https://accounts.google.com", aud: "server-client-id" }));
      response.emit("end");
    };
    return request;
  });
  const service = createGoogleTokenService({
    clientId: "server-client-id",
    client: { verifyIdToken: async () => { throw Object.assign(new Error("timeout"), { code: "ETIMEDOUT" }); } },
    enableCloudbaseProviderFallback: false,
    enableTokenInfoFallback: true,
  });
  assert.equal((await service.verifyIdToken("test-token")).sub, "google-sub");
  assert.equal(requestCount, 1);
});

test("verifies Google ID tokens for the configured server client", async () => {
  const calls = [];
  const service = createGoogleTokenService({
    clientId: "server-client-id",
    client: {
      async verifyIdToken(input) {
        calls.push(input);
        return { getPayload: () => ({ sub: "google-sub", email: "user@example.com", email_verified: true, iss: "https://accounts.google.com", aud: "server-client-id" }) };
      },
    },
  });
  assert.deepEqual(await service.verifyIdToken("id-token"), { sub: "google-sub", email: "user@example.com", email_verified: true, iss: "https://accounts.google.com", aud: "server-client-id" });
  assert.deepEqual(calls, [{ idToken: "id-token", audience: "server-client-id" }]);
});

test("accepts Google's legacy issuer form", async () => {
  const service = createGoogleTokenService({
    clientId: "server-client-id",
    client: {
      async verifyIdToken() {
        return {
          getPayload: () => ({
            sub: "google-sub",
            email: "user@example.com",
            email_verified: true,
            iss: "accounts.google.com",
            aud: "server-client-id",
          }),
        };
      },
    },
  });

  assert.equal((await service.verifyIdToken("id-token")).sub, "google-sub");
});

test("falls back to Google's tokeninfo endpoint after verifier transport timeout", async () => {
  const calls = [];
  const service = createGoogleTokenService({
    clientId: "server-client-id",
    timeoutMs: 200,
    primaryTimeoutMs: 20,
    client: { verifyIdToken: () => new Promise(() => {}) },
    enableTokenInfoFallback: true,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return {
        ok: true,
        async json() {
          return {
            sub: "google-sub",
            email: "user@example.com",
            email_verified: "true",
            iss: "https://accounts.google.com",
            aud: "server-client-id",
          };
        },
      };
    },
  });

  assert.deepEqual(await service.verifyIdToken("id-token"), {
    sub: "google-sub",
    email: "user@example.com",
    email_verified: true,
    iss: "https://accounts.google.com",
    aud: "server-client-id",
  });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /^https:\/\/oauth2\.googleapis\.com\/tokeninfo\?id_token=/);
  assert.deepEqual(calls[0].options, { headers: { accept: "application/json" } });
});

test("uses the configured CloudBase Google provider before direct Google fallback", async () => {
  const calls = [];
  const service = createGoogleTokenService({
    clientId: "server-client-id",
    timeoutMs: 200,
    primaryTimeoutMs: 20,
    client: {
      async verifyIdToken() {
        const error = new Error("Google public keys unavailable");
        error.code = "ETIMEDOUT";
        throw error;
      },
    },
    cloudbaseAuthEnvId: "test-dev-env",
    enableTokenInfoFallback: false,
    cloudbaseProviderRequest: async (input) => {
      calls.push(input);
      return {
        ok: true,
        status: 200,
        async json() {
          return { provider_profile: { sub: "google-sub", email: "user@example.com" } };
        },
      };
    },
  });

  assert.deepEqual(await service.verifyIdToken("id-token"), {
    sub: "google-sub",
    email: "user@example.com",
    email_verified: true,
    iss: "https://accounts.google.com",
    aud: "server-client-id",
    provider: "cloudbase-google-provider",
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].envId, "test-dev-env");
  assert.equal(calls[0].idToken, "id-token");
  assert.ok(calls[0].timeoutMs > 0 && calls[0].timeoutMs <= 200);
});

test("verifies an ID token through CloudBase's direct provider sign-in API", async () => {
  const calls = [];
  const service = createGoogleTokenService({
    clientId: "server-client-id",
    timeoutMs: 200,
    primaryTimeoutMs: 20,
    client: {
      async verifyIdToken() {
        const error = new Error("Google public keys unavailable");
        error.code = "ETIMEDOUT";
        throw error;
      },
    },
    cloudbaseAuthEnvId: "test-dev-env",
    cloudbaseIdTokenRequest: async (input) => {
      calls.push(input);
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            data: {
              user: {
                id: "cloudbase-user-id",
                email: "user@example.com",
              },
              session: { access_token: "[redacted]" },
            },
          };
        },
      };
    },
    enableTokenInfoFallback: false,
  });

  assert.deepEqual(await service.verifyIdToken("id-token"), {
    sub: "cloudbase-user-id",
    email: "user@example.com",
    email_verified: true,
    iss: "https://accounts.google.com",
    aud: "server-client-id",
    provider: "cloudbase-google-id-token",
  });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], {
    envId: "test-dev-env",
    idToken: "id-token",
    timeoutMs: calls[0].timeoutMs,
  });
  assert.ok(calls[0].timeoutMs > 0 && calls[0].timeoutMs <= 200);
});

test("loads the verified CloudBase user email when direct sign-in returns a standard token response", async () => {
  const userInfoCalls = [];
  const service = createGoogleTokenService({
    clientId: "server-client-id",
    timeoutMs: 200,
    primaryTimeoutMs: 20,
    client: { verifyIdToken: () => Promise.reject(Object.assign(new Error("network"), { code: "ETIMEDOUT" })) },
    cloudbaseAuthEnvId: "test-dev-env",
    cloudbaseIdTokenRequest: async () => ({
      ok: true,
      status: 200,
      async json() {
        return { access_token: "[redacted]", sub: "cloudbase-user-id" };
      },
    }),
    cloudbaseUserInfoRequest: async (input) => {
      userInfoCalls.push(input);
      return {
        ok: true,
        status: 200,
        async json() {
          return { data: { user: { sub: "cloudbase-user-id", email: "user@example.com" } } };
        },
      };
    },
    enableTokenInfoFallback: false,
  });

  assert.equal((await service.verifyIdToken("id-token")).email, "user@example.com");
  assert.equal(userInfoCalls.length, 1);
  assert.equal(userInfoCalls[0].envId, "test-dev-env");
  assert.equal(userInfoCalls[0].accessToken, "[redacted]");
});

test("maps a reachable CloudBase provider rejection to invalid credentials", async () => {
  const service = createGoogleTokenService({
    clientId: "server-client-id",
    timeoutMs: 200,
    primaryTimeoutMs: 20,
    client: {
      async verifyIdToken() {
        const error = new Error("Google public keys unavailable");
        error.code = "ETIMEDOUT";
        throw error;
      },
    },
    cloudbaseAuthEnvId: "test-dev-env",
    enableTokenInfoFallback: false,
    cloudbaseProviderRequest: async () => ({
      ok: false,
      status: 400,
      async json() {
        return { code: "FAILED_PRECONDITION", error_description: "Invalid Credentials" };
      },
    }),
  });

  await assert.rejects(
    () => service.verifyIdToken("id-token"),
    (error) => error.code === "AUTH_INVALID_CREDENTIALS",
  );
});

test("falls back to Google tokeninfo when CloudBase rejects an ID token", async () => {
  const service = createGoogleTokenService({
    clientId: "server-client-id",
    timeoutMs: 200,
    primaryTimeoutMs: 20,
    client: {
      async verifyIdToken() {
        const error = new Error("Google public keys unavailable");
        error.code = "ETIMEDOUT";
        throw error;
      },
    },
    cloudbaseAuthEnvId: "test-dev-env",
    enableTokenInfoFallback: true,
    cloudbaseProviderRequest: async () => ({
      ok: false,
      status: 400,
      async json() {
        return { code: "FAILED_PRECONDITION", error_description: "Invalid Credentials" };
      },
    }),
    fetchImpl: async () => ({
      ok: true,
      async json() {
        return {
          sub: "google-sub",
          email: "user@example.com",
          email_verified: "true",
          iss: "https://accounts.google.com",
          aud: "server-client-id",
        };
      },
    }),
  });

  assert.equal((await service.verifyIdToken("id-token")).sub, "google-sub");
});

test("classifies rejected Google claims without exposing their values", async () => {
  const service = createGoogleTokenService({
    clientId: "server-client-id",
    client: {
      async verifyIdToken() {
        return {
          getPayload: () => ({
            sub: "google-sub",
            email: "user@example.com",
            email_verified: true,
            iss: "https://accounts.google.com",
            aud: "different-client-id",
          }),
        };
      },
    },
  });

  await assert.rejects(
    () => service.verifyIdToken("id-token"),
    (error) => error.code === "AUTH_INVALID_CREDENTIALS"
      && error.authReason === "audience_mismatch"
      && !Object.hasOwn(error, "token")
      && !Object.hasOwn(error, "email"),
  );
});

test("classifies verifier rejection as an invalid Google token", async () => {
  const service = createGoogleTokenService({
    clientId: "server-client-id",
    client: {
      async verifyIdToken() {
        throw new Error("Invalid token signature");
      },
    },
  });

  await assert.rejects(
    () => service.verifyIdToken("id-token"),
    (error) => error.code === "AUTH_INVALID_CREDENTIALS" && error.authReason === "invalid_token",
  );
});

test("fails with a provider error when Google verification does not respond in time", async () => {
  const service = createGoogleTokenService({
    clientId: "server-client-id",
    timeoutMs: 20,
    client: { verifyIdToken: () => new Promise(() => {}) },
  });

  await assert.rejects(
    () => service.verifyIdToken("id-token"),
    (error) => error.code === "AUTH_PROVIDER_UNAVAILABLE",
  );
});
