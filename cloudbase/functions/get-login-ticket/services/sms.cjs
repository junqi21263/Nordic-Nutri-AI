class SmsProviderError extends Error {
  constructor() {
    super("SMS provider unavailable");
    this.code = "AUTH_PROVIDER_UNAVAILABLE";
  }
}

function createSmsService({ apiKey, fromE164, fetchImpl = fetch } = {}) {
  if (!apiKey || !fromE164) throw new Error("httpSMS configuration is unavailable");
  return {
    async sendVerificationCode(phone, code) {
      const response = await fetchImpl("https://api.httpsms.com/v1/messages/send", {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          from: fromE164,
          to: phone,
          content: `Your Nordic Nutri verification code is ${code}. It expires in 10 minutes.`,
        }),
      }).catch(() => null);
      if (!response?.ok) throw new SmsProviderError();
      return true;
    },
  };
}

module.exports = { SmsProviderError, createSmsService };
