class EmailProviderError extends Error {
  constructor({ httpStatus = null, providerErrorCode = null } = {}) {
    super("Email provider unavailable");
    this.code = "AUTH_PROVIDER_UNAVAILABLE";
    this.provider = "brevo";
    this.providerHttpStatus = httpStatus;
    this.providerErrorCode = providerErrorCode;
  }
}

function createEmailService({ apiKey, senderEmail, senderName = "Nordic Nutri", fetchImpl = fetch } = {}) {
  if (!apiKey || !senderEmail) throw new Error("Brevo email configuration is unavailable");
  return {
    async sendVerificationCode(email, code) {
      const response = await fetchImpl("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "api-key": apiKey,
        },
        body: JSON.stringify({
          sender: { email: senderEmail, name: senderName },
          to: [{ email }],
          subject: "Nordic Nutri verification code",
          textContent: `Your Nordic Nutri verification code is ${code}. It expires in 10 minutes.`,
        }),
      }).catch(() => null);
      if (!response?.ok) throw new EmailProviderError({ httpStatus: response?.status ?? null, providerErrorCode: response?.status ? `HTTP_${response.status}` : null });
      let result = null;
      try { result = typeof response.json === "function" ? await response.json() : null; } catch { result = null; }
      return {
        provider: "brevo",
        messageId: result?.messageId || result?.message_id || null,
        deliveryStatus: "accepted",
        httpStatus: response.status ?? null,
      };
    },
  };
}

module.exports = { EmailProviderError, createEmailService };
