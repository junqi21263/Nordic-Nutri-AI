import assert from "node:assert/strict";
import test from "node:test";

import { buildApiRequest } from "./http-client.mjs";

test("buildApiRequest sends a JSON request without logging or serializing the bearer token", () => {
  const request = buildApiRequest({
    baseUrl: "https://example.test/get-login-ticket",
    path: "/foods/categories",
    method: "GET",
    token: "secret-session-token",
  });

  assert.equal(request.url, "https://example.test/get-login-ticket/foods/categories");
  assert.equal(request.options.headers.authorization, "Bearer secret-session-token");
  assert.equal(request.safeLabel, "GET /foods/categories");
});

test("buildApiRequest rejects paths that escape the configured function endpoint", () => {
  assert.throws(
    () => buildApiRequest({
      baseUrl: "https://example.test/get-login-ticket",
      path: "https://other.test/steal",
      method: "GET",
      token: null,
    }),
    /path must start with a slash/,
  );
});
