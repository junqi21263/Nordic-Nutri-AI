import test from "node:test";
import assert from "node:assert/strict";
import worker from "./worker.mjs";

test("only fixed public-key GET endpoints are exposed", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("unexpected"); });
  for (const [path, method, status] of [["/google/certs/pem?token=secret", "GET", 404], ["/proxy", "GET", 404], ["/google/certs/pem", "POST", 405]]) {
    assert.equal((await worker.fetch(new Request(`https://relay.example${path}`, { method }))).status, status);
  }
  assert.equal(calls, 0);
});

test("forwards neither credentials nor caller-controlled URLs and subtracts cache age", async (t) => {
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(url, "https://www.googleapis.com/oauth2/v1/certs");
    assert.deepEqual(options.headers, { accept: "application/json" });
    assert.equal(options.redirect, "manual");
    return new Response('{"kid":"public-key"}', { headers: { "Cache-Control": "public, max-age=600", Age: "100" } });
  });
  const result = await worker.fetch(new Request("https://relay.example/google/certs/pem", { headers: { Authorization: "Bearer secret", Cookie: "secret" } }));
  assert.equal(result.headers.get("cache-control"), "public, max-age=500, must-revalidate");
  assert.equal(await result.text(), '{"kid":"public-key"}');
});

test("upstream errors are not cached or exposed", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("upstream details", { status: 500 }));
  const result = await worker.fetch(new Request("https://relay.example/google/certs/jwk"));
  assert.equal(result.status, 503);
  assert.equal(result.headers.get("cache-control"), "no-store");
  assert.equal(await result.text(), "");
});

test("FCM relay requires the shared secret before making any upstream request", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; throw new Error("unexpected"); });
  const request = new Request("https://relay.example/fcm/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId: "nordic-nutri", assertion: "jwt", message: { token: "device" } }),
  });
  const result = await worker.fetch(request, { FCM_RELAY_SHARED_SECRET: "relay-secret" });
  assert.equal(result.status, 401);
  assert.equal(calls, 0);
});

test("FCM relay exchanges the signed assertion and forwards only the fixed FCM endpoint", async (t) => {
  const requests = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    requests.push({ url, options });
    if (url === "https://oauth2.googleapis.com/token") {
      assert.equal(options.method, "POST");
      assert.equal(options.headers["Content-Type"], "application/x-www-form-urlencoded");
      const form = new URLSearchParams(options.body);
      assert.equal(form.get("grant_type"), "urn:ietf:params:oauth:grant-type:jwt-bearer");
      assert.equal(form.get("assertion"), "signed-assertion-which-is-long-enough-for-the-relay");
      return new Response(JSON.stringify({ access_token: "oauth-access-token", expires_in: 3600 }), { status: 200 });
    }
    assert.equal(url, "https://fcm.googleapis.com/v1/projects/nordic-nutri/messages:send");
    assert.equal(options.headers.Authorization, "Bearer oauth-access-token");
    assert.deepEqual(JSON.parse(options.body), { message: { token: "device-token" } });
    return new Response(JSON.stringify({ name: "projects/nordic-nutri/messages/message-1" }), { status: 200 });
  });

  const result = await worker.fetch(new Request("https://relay.example/fcm/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-FCM-Relay-Secret": "relay-secret" },
    body: JSON.stringify({
      projectId: "nordic-nutri",
      assertion: "signed-assertion-which-is-long-enough-for-the-relay",
      message: { token: "device-token" },
      upstreamUrl: "https://attacker.example/steal",
    }),
  }), { FCM_RELAY_SHARED_SECRET: "relay-secret" });

  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { name: "projects/nordic-nutri/messages/message-1" });
  assert.deepEqual(requests.map((item) => item.url), [
    "https://oauth2.googleapis.com/token",
    "https://fcm.googleapis.com/v1/projects/nordic-nutri/messages:send",
  ]);
});
