import assert from "node:assert/strict";
import test from "node:test";

import { SmsProviderError, createSmsService } from "./sms.cjs";

test("sends an OTP through the Spug SMS template URL", async () => {
  const calls = [];
  const service = createSmsService({
    templateUrl: "https://push.spug.cc/sms/template-secret",
    fetchImpl: async (...args) => {
      calls.push(args);
      return { ok: true };
    },
  });

  await service.sendVerificationCode("+8613900139000", "123456");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "https://push.spug.cc/sms/template-secret");
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    to: "+8613900139000",
    code: "123456",
    number: 10,
  });
});

test("maps Spug failures to a provider error", async () => {
  const service = createSmsService({
    templateUrl: "https://push.spug.cc/sms/template-secret",
    fetchImpl: async () => ({ ok: false }),
  });
  await assert.rejects(() => service.sendVerificationCode("+8613900139000", "123456"), SmsProviderError);
});
