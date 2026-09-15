class SmsProviderError extends Error {
  constructor({ httpStatus = null, providerErrorCode = null } = {}) {
    super("SMS provider unavailable");
    this.code = "AUTH_PROVIDER_UNAVAILABLE";
    this.provider = "spug";
    this.providerHttpStatus = httpStatus;
    this.providerErrorCode = providerErrorCode;
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
          to: phone,
          code: String(code),
          number: 10,
        }),
      }).catch(() => null);
      if (!response?.ok) throw new SmsProviderError({ httpStatus: response?.status ?? null, providerErrorCode: response?.status ? `HTTP_${response.status}` : null });
      let result = null;
      try { result = typeof response.json === "function" ? await response.json() : null; } catch { result = null; }
      return {
        provider: "spug",
        messageId: result?.messageId || result?.message_id || result?.id || result?.data?.id || null,
        deliveryStatus: result?.status || "accepted",
        httpStatus: response.status ?? null,
      };
    },
  };
}

module.exports = { SmsProviderError, createSmsService };
