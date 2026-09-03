const TRANSIENT_DB_ERROR = /timeout|timed out|connection|network|temporar|unavailable|gateway|fetch failed|reset/i;

function isTransientDbError(error) {
  const message = error?.message || error?.error_description || error?.details || error;
  return TRANSIENT_DB_ERROR.test(String(message || ""));
}

async function withDbReadRetry(read, { retries = 1, delayMs = 80 } = {}) {
  let attempt = 0;
  while (true) {
    try {
      const result = await read();
      if (!result?.error || attempt >= retries || !isTransientDbError(result.error)) return result;
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    } catch (error) {
      if (attempt >= retries || !isTransientDbError(error)) throw error;
      if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    attempt += 1;
  }
}

module.exports = { isTransientDbError, withDbReadRetry };
