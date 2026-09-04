import assert from "node:assert/strict";
import test from "node:test";

import { createEmailService } from "./services/email.cjs";
import { createSmsService } from "./services/sms.cjs";

test("Brevo email service sends only the verification message payload", async () => {
  let request;
  const service = createEmailService({
    apiKey: "brevo-secret",
    senderEmail: "noreply@example.com",
    senderName: "Nordic Nutri",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 201, json: async () => ({ messageId: "provider-id" }) };
    },
  });

  await service.sendVerificationCode("user@example.com", "123456");
  assert.equal(request.url, "https://api.brevo.com/v3/smtp/email");
  assert.equal(request.options.headers["api-key"], "brevo-secret");
  assert.match(request.options.body, /user@example\.com/);
  assert.match(request.options.body, /123456/);
});

test("httpSMS service sends an E.164 verification message", async () => {
  let request;
  const service = createSmsService({
    apiKey: "httpsms-secret",
    from: "+8613800138000",
    fetchImpl: async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200, json: async () => ({ id: "sms-id" }) };
    },
  });

  await service.sendVerificationCode("+8613900139000", "654321");
  assert.equal(request.url, "https://api.httpsms.com/v1/messages/send");
  assert.equal(request.options.headers["x-api-key"], "httpsms-secret");
  assert.match(request.options.body, /\+8613900139000/);
  assert.match(request.options.body, /654321/);
});

test("provider failures are surfaced without exposing response bodies", async () => {
  const service = createEmailService({
    apiKey: "brevo-secret",
    senderEmail: "noreply@example.com",
    fetchImpl: async () => ({ ok: false, status: 500, text: async () => "secret provider body" }),
  });

  await assert.rejects(() => service.sendVerificationCode("user@example.com", "123456"), (error) => (
    error.code === "AUTH_PROVIDER_UNAVAILABLE" && !error.message.includes("secret provider body")
  ));
});
