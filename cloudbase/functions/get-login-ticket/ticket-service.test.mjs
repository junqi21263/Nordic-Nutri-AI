import assert from "node:assert/strict";
import test from "node:test";

import {
  createTicketService,
  identityProofForOpenId,
} from "./ticket-service.cjs";

test("returns only a ticket and HMAC identity proof for a valid WeChat code", async () => {
  const service = createTicketService({
    exchangeCode: async (code) => {
      assert.equal(code, "fresh-wechat-code");
      return { openid: "wx-openid-123" };
    },
    createTicket: (openid) => `ticket:${openid}`,
    identityPepper: "test-pepper",
  });

  const result = await service.issue({ code: "fresh-wechat-code" });

  assert.deepEqual(result, {
    ticket: "ticket:wx-openid-123",
    identityProof: identityProofForOpenId("wx-openid-123", "test-pepper"),
  });
  assert.equal("openid" in result, false);
  assert.equal("unionid" in result, false);
});

test("rejects a missing or malformed WeChat code before exchange", async () => {
  const service = createTicketService({
    exchangeCode: async () => {
      throw new Error("must not exchange invalid code");
    },
    createTicket: () => "unused",
    identityPepper: "test-pepper",
  });

  await assert.rejects(() => service.issue({}), (error) => error.code === "WECHAT_CODE_INVALID");
  await assert.rejects(() => service.issue({ code: " " }), (error) => error.code === "WECHAT_CODE_INVALID");
});

test("does not expose upstream WeChat or ticket errors", async () => {
  const service = createTicketService({
    exchangeCode: async () => {
      throw new Error("wechat upstream detail");
    },
    createTicket: () => "unused",
    identityPepper: "test-pepper",
  });

  await assert.rejects(() => service.issue({ code: "fresh-wechat-code" }), (error) => (
    error.code === "WECHAT_LOGIN_FAILED" && !error.message.includes("upstream")
  ));
});
