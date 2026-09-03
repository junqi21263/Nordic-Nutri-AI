const VISION_PROVIDER_ERRORS = Object.freeze({
  TIMEOUT: "timeout",
  NETWORK: "network",
  AUTH: "auth",
  RATE_LIMIT: "rate_limit",
  BAD_REQUEST: "bad_request",
  MEDIA_UNSUPPORTED: "media_unsupported",
  INVALID_RESPONSE: "invalid_response",
  UNAVAILABLE: "unavailable",
  UNKNOWN: "unknown",
});

function classifyVisionProviderError(error = {}) {
  const status = Number(error.providerHttpStatus ?? error.status ?? error.statusCode);
  const code = String(error.code ?? error.providerErrorCode ?? "").toUpperCase();
  if (code.includes("TIMEOUT") || code.includes("ABORT") || error.name === "AbortError") return VISION_PROVIDER_ERRORS.TIMEOUT;
  if (status === 401 || status === 403 || code.includes("AUTH") || code.includes("UNAUTHORIZED")) return VISION_PROVIDER_ERRORS.AUTH;
  if (status === 429 || code.includes("RATE_LIMIT") || code.includes("TOO_MANY")) return VISION_PROVIDER_ERRORS.RATE_LIMIT;
  if (status >= 400 && status < 500) {
    if (status === 415 || code.includes("MEDIA") || code.includes("UNSUPPORTED")) return VISION_PROVIDER_ERRORS.MEDIA_UNSUPPORTED;
    return VISION_PROVIDER_ERRORS.BAD_REQUEST;
  }
  if (status >= 500 || code.includes("RETRYABLE") || code.includes("UNAVAILABLE")) return VISION_PROVIDER_ERRORS.UNAVAILABLE;
  if (code.includes("NETWORK") || error.name === "FetchError" || error.name === "TypeError") return VISION_PROVIDER_ERRORS.NETWORK;
  if (code.includes("INVALID_RESPONSE") || code.includes("RESULT_INVALID")) return VISION_PROVIDER_ERRORS.INVALID_RESPONSE;
  return VISION_PROVIDER_ERRORS.UNKNOWN;
}

function isRetryableVisionProviderError(error) {
  return [VISION_PROVIDER_ERRORS.TIMEOUT, VISION_PROVIDER_ERRORS.NETWORK, VISION_PROVIDER_ERRORS.RATE_LIMIT, VISION_PROVIDER_ERRORS.UNAVAILABLE]
    .includes(classifyVisionProviderError(error));
}

module.exports = { VISION_PROVIDER_ERRORS, classifyVisionProviderError, isRetryableVisionProviderError };
