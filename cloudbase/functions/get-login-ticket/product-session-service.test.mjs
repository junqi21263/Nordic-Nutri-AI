import assert from "node:assert/strict";
import test from "node:test";

import { createProductSessionService } from "./product-session-service.cjs";

test("exchanges a one-time WeChat code into a product session without exposing OpenID", async () => {
  let receivedOpenIdHash = null;
  const service = createProductSessionService({
    exchangeCode: async (code) => {
      assert.equal(code, "fresh-wechat-code");
      return { openid: "wx-openid-123" };
    },
    bootstrapUser: async (openidHash) => {
      receivedOpenIdHash = openidHash;
      return { userId: "user-1", onboardingRequired: true };
    },
    identityPepper: "identity-pepper",
    sessionSecret: "session-secret",
    now: () => 1_700_000_000_000,
  });

  const result = await service.issue({ code: "fresh-wechat-code" });

  assert.equal(result.user.id, "user-1");
  assert.equal(result.onboardingRequired, true);
  assert.equal(typeof result.session.accessToken, "string");
  assert.equal(receivedOpenIdHash?.length, 64);
  assert.equal("openid" in result, false);
  assert.equal("unionid" in result, false);
});

test("rejects a malformed WeChat code before calling WeChat", async () => {
  const service = createProductSessionService({
    exchangeCode: async () => { throw new Error("must not be called"); },
    bootstrapUser: async () => ({ userId: "unused", onboardingRequired: false }),
    identityPepper: "identity-pepper",
    sessionSecret: "session-secret",
  });

  await assert.rejects(() => service.issue({ code: " " }), (error) => error.code === "WECHAT_CODE_INVALID");
});

test("preserves only the safe WeChat error code for HTTP diagnostics", async () => {
  const service = createProductSessionService({
    exchangeCode: async () => {
      const error = new Error("WeChat rejected the exchange");
      error.wechatErrorCode = 40125;
      throw error;
    },
    bootstrapUser: async () => ({ userId: "unused", onboardingRequired: false }),
    identityPepper: "identity-pepper",
    sessionSecret: "session-secret",
  });

  await assert.rejects(() => service.issue({ code: "fresh-code" }), (error) => (
    error.code === "WECHAT_LOGIN_FAILED" && error.wechatErrorCode === 40125
  ));
});

test("reports product-user bootstrap failures separately from WeChat exchange failures", async () => {
  const service = createProductSessionService({
    exchangeCode: async () => ({ openid: "wx-openid-123" }),
    bootstrapUser: async () => { throw new Error("database unavailable"); },
    identityPepper: "identity-pepper",
    sessionSecret: "session-secret",
  });

  await assert.rejects(() => service.issue({ code: "fresh-code" }), (error) => error.code === "PRODUCT_SESSION_FAILED");
});
