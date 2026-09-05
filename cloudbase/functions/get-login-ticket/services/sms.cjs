class SmsProviderError extends Error {
  constructor() {
    super("SMS provider unavailable");
    this.code = "AUTH_PROVIDER_UNAVAILABLE";
  }
}

function createSmsService({ templateUrl, fetchImpl = fetch } = {}) {
  if (!templateUrl) throw new Error("Spug SMS configuration is unavailable");
  return {
    async sendVerificationCode(phone, code) {
      const response = await fetchImpl(templateUrl, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Nordic Nutri AI",
          code: String(code),
          targets: phone,
        }),
      }).catch(() => null);
      if (!response?.ok) throw new SmsProviderError();
      return true;
    },
  };
}

module.exports = { SmsProviderError, createSmsService };
