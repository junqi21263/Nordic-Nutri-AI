import assert from "node:assert/strict";
import test from "node:test";

import { SmsProviderError, createSmsService } from "./sms.cjs";

test("sends an OTP through httpSMS without exposing the API key", async () => {
  const calls = [];
  const service = createSmsService({
    apiKey: "secret-key",
    fromE164: "+8613800138000",
    fetchImpl: async (...args) => {
      calls.push(args);
      return { ok: true };
    },
  });

  await service.sendVerificationCode("+8613900139000", "123456");
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "https://api.httpsms.com/v1/messages/send");
  assert.equal(calls[0][1].headers["x-api-key"], "secret-key");
  assert.deepEqual(JSON.parse(calls[0][1].body), {
    from: "+8613800138000",
    to: "+8613900139000",
    content: "Your Nordic Nutri verification code is 123456. It expires in 10 minutes.",
  });
});

test("maps httpSMS failures to a provider error", async () => {
  const service = createSmsService({
    apiKey: "secret-key",
    fromE164: "+8613800138000",
    fetchImpl: async () => ({ ok: false }),
  });
  await assert.rejects(() => service.sendVerificationCode("+8613900139000", "123456"), SmsProviderError);
});
