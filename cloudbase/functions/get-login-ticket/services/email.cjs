class EmailProviderError extends Error {
  constructor() {
    super("Email provider unavailable");
    this.code = "AUTH_PROVIDER_UNAVAILABLE";
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
      if (!response?.ok) throw new EmailProviderError();
      return true;
    },
  };
}

module.exports = { EmailProviderError, createEmailService };
