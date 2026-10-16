import assert from "node:assert/strict";
import test from "node:test";

import { createSmsService } from "./services/sms.cjs";

test("sends a Chinese mobile number using this Spug verification template's to field", async () => {
  let request;
  const sms = createSmsService({
    templateUrl: "https://push.spug.cc/send/test-template",
    fetchImpl: async (_url, options) => {
      request = options;
      return { ok: true, status: 200, json: async () => ({ code: 200, msg: "请求成功" }) };
    },
  });

  const delivery = await sms.sendVerificationCode("+8613800138000", "123456");
  assert.deepEqual(JSON.parse(request.body), { to: "+8613800138000", code: "123456", number: 10 });
  assert.equal(delivery.deliveryStatus, "accepted");
});

test("does not treat an HTTP 200 provider rejection as a sent code", async () => {
  const sms = createSmsService({
    templateUrl: "https://push.spug.cc/send/test-template",
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ code: 400, msg: "rejected" }) }),
  });

  await assert.rejects(sms.sendVerificationCode("+8613800138000", "123456"), { code: "AUTH_PROVIDER_UNAVAILABLE" });
});
