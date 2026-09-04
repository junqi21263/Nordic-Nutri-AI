import assert from "node:assert/strict";
import test from "node:test";

import { createEmailService } from "./services/email.cjs";

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
