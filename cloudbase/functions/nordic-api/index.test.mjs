import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const { createApiService, createNativeOpenIdResolver, getRuntimeEnvironmentId, main } = await import("./index.js");

test("exports the Event Function handler", () => {
  assert.equal(typeof main, "function");
});

test("declares the Node WebSocket dependency used by the server RDB SDK", () => {
  const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
  assert.ok(packageJson.dependencies.ws);
});

test("uses the explicit CloudBase environment when TCB_ENV is unavailable", () => {
  assert.equal(getRuntimeEnvironmentId({}), "lewis-healthy-d4glgqqzv73a5bc10");
  assert.equal(getRuntimeEnvironmentId({ CLOUDBASE_ENV_ID: "configured-environment" }), "configured-environment");
});

test("reads the caller identity from the verified wx-server-sdk context", () => {
  const getOpenId = createNativeOpenIdResolver({
    getWXContext: () => ({ OPENID: "trusted-openid" }),
  });

  assert.equal(getOpenId(), "trusted-openid");
});

test("rejects a native function call without verified OpenID", async () => {
  const service = createApiService({
    getOpenId: async () => "",
    bootstrapUser: async () => ({ userId: "never" }),
  });
  await assert.rejects(service.handle({ action: "bootstrap", userId: "forged" }), { code: "UNAUTHORIZED" });
});

test("ignores caller-supplied user IDs and bootstraps from CloudBase OpenID", async () => {
  let receivedOpenId = null;
  const service = createApiService({
    getOpenId: async () => "trusted-openid",
    bootstrapUser: async (openid) => {
      receivedOpenId = openid;
      return { userId: "derived-user-id", onboardingRequired: true };
    },
  });
  const result = await service.handle({ action: "bootstrap", userId: "forged" });
  assert.equal(receivedOpenId, "trusted-openid");
  assert.deepEqual(result, { userId: "derived-user-id", onboardingRequired: true });
});
